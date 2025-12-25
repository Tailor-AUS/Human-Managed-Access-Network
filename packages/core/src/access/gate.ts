/**
 * HMAN Gate - Access Control System
 *
 * The Gate is the enforcement point for human-managed access.
 * Every AI access request passes through the Gate.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  type AccessRequest,
  type AccessRequestStatus,
  type AccessResponse,
  type RequesterInfo,
  type ResourceInfo,
  type AuditActor,
  type AuditResource,
  PermissionLevel,
  parseHmanUri,
} from '@hman/shared';
import { VaultManager } from '../vault/index.js';
import { AuditLogger } from '../audit/index.js';

/**
 * Callback for handling access requests that require user approval
 */
export type AccessRequestHandler = (request: AccessRequest) => Promise<AccessResponse | null>;

/**
 * Callback for notifying user of access (for Standard level)
 */
export type AccessNotificationHandler = (request: AccessRequest) => Promise<void>;

export interface GateConfig {
  /** Vault manager for permission lookups */
  vaultManager: VaultManager;
  /** Audit logger */
  auditLogger: AuditLogger;
  /** Handler for Gated (Level 2) access requests */
  accessRequestHandler?: AccessRequestHandler;
  /** Handler for Standard (Level 1) access notifications */
  accessNotificationHandler?: AccessNotificationHandler;
  /** Default timeout for access requests in milliseconds */
  requestTimeoutMs?: number;
}

export interface GateDecision {
  /** Whether access is granted */
  granted: boolean;
  /** The permission level of the resource */
  permissionLevel: PermissionLevel;
  /** How the decision was made */
  method: 'auto' | 'user_approved' | 'delegate_approved' | 'denied' | 'locked';
  /** For approved requests, when the approval expires */
  expiresAt?: Date;
  /** For denied requests, the reason */
  denialReason?: string;
  /** The access request that was created */
  request?: AccessRequest;
}

/**
 * HMAN Gate - enforces access control policies
 */
export class Gate {
  private vaultManager: VaultManager;
  private auditLogger: AuditLogger;
  private accessRequestHandler?: AccessRequestHandler;
  private accessNotificationHandler?: AccessNotificationHandler;
  private requestTimeoutMs: number;

  // Pending requests (in a real app, this would be persisted)
  private pendingRequests: Map<string, AccessRequest> = new Map();

  // Temporary approvals cache
  private approvalCache: Map<string, { expiresAt: Date; requesterId: string }> = new Map();

  constructor(config: GateConfig) {
    this.vaultManager = config.vaultManager;
    this.auditLogger = config.auditLogger;
    this.accessRequestHandler = config.accessRequestHandler;
    this.accessNotificationHandler = config.accessNotificationHandler;
    this.requestTimeoutMs = config.requestTimeoutMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Request access to a resource
   * This is the main entry point for all access requests
   */
  async requestAccess(
    requester: RequesterInfo,
    resourceUri: string,
    purpose: string
  ): Promise<GateDecision> {
    // Parse the URI to understand what's being accessed
    const parsedUri = parseHmanUri(resourceUri);
    if (!parsedUri) {
      return {
        granted: false,
        permissionLevel: PermissionLevel.Locked,
        method: 'denied',
        denialReason: 'Invalid resource URI',
      };
    }

    // Get the vault and determine permission level
    const vaults = await this.vaultManager.getAllVaults();
    const vault = vaults.find(v => v.type === parsedUri.vault);

    if (!vault) {
      return {
        granted: false,
        permissionLevel: PermissionLevel.Locked,
        method: 'denied',
        denialReason: 'Vault not found',
      };
    }

    // Check if there's a specific item being accessed
    let permissionLevel = vault.defaultPermissionLevel;

    if (parsedUri.itemId) {
      try {
        permissionLevel = await this.vaultManager.getItemPermissionLevel(parsedUri.itemId);
      } catch {
        // Item not found - use vault default
      }
    }

    // Create the resource info
    const resourceInfo: ResourceInfo = {
      uri: resourceUri,
      name: `${parsedUri.vault}/${parsedUri.category}${parsedUri.itemId ? '/' + parsedUri.itemId : ''}`,
      vaultId: vault.id,
      permissionLevel,
    };

    // Log the access request
    const auditActor: AuditActor = {
      type: requester.type === 'ai_model' ? 'ai_model' : requester.type === 'bot' ? 'bot' : 'user',
      id: requester.id,
      name: requester.name,
      modelId: requester.metadata?.modelId as string | undefined,
    };

    const auditResource: AuditResource = {
      uri: resourceUri,
      vaultId: vault.id,
      itemId: parsedUri.itemId,
      permissionLevel,
    };

    await this.auditLogger.logAccessRequest(auditActor, auditResource);

    // Check if there's a valid cached approval
    const cacheKey = `${requester.id}:${resourceUri}`;
    const cached = this.approvalCache.get(cacheKey);
    if (cached && cached.expiresAt > new Date() && cached.requesterId === requester.id) {
      await this.auditLogger.logAccessGranted(auditActor, auditResource, 'pre_authorized');
      return {
        granted: true,
        permissionLevel,
        method: 'auto',
        expiresAt: cached.expiresAt,
      };
    }

    // Handle based on permission level
    switch (permissionLevel) {
      case PermissionLevel.Open:
        // Auto-approve and log
        await this.auditLogger.logAccessGranted(auditActor, auditResource, 'auto');
        return {
          granted: true,
          permissionLevel,
          method: 'auto',
        };

      case PermissionLevel.Standard:
        // Auto-approve but notify user
        if (this.accessNotificationHandler) {
          const request = this.createAccessRequest(requester, resourceInfo, purpose);
          // Don't await - notification is async
          this.accessNotificationHandler(request).catch(() => {
            // Ignore notification failures
          });
        }
        await this.auditLogger.logAccessGranted(auditActor, auditResource, 'auto');
        return {
          granted: true,
          permissionLevel,
          method: 'auto',
        };

      case PermissionLevel.Gated:
        // Require user approval
        return this.handleGatedAccess(requester, resourceInfo, purpose, auditActor, auditResource);

      case PermissionLevel.Locked:
        // Never allow
        await this.auditLogger.logAccessDenied(auditActor, auditResource, 'Resource is locked');
        return {
          granted: false,
          permissionLevel,
          method: 'locked',
          denialReason: 'This resource is locked and cannot be accessed via MCP',
        };

      default:
        await this.auditLogger.logAccessDenied(auditActor, auditResource, 'Unknown permission level');
        return {
          granted: false,
          permissionLevel,
          method: 'denied',
          denialReason: 'Unknown permission level',
        };
    }
  }

  /**
   * Handle gated access - requires user approval
   */
  private async handleGatedAccess(
    requester: RequesterInfo,
    resource: ResourceInfo,
    purpose: string,
    auditActor: AuditActor,
    auditResource: AuditResource
  ): Promise<GateDecision> {
    if (!this.accessRequestHandler) {
      await this.auditLogger.logAccessDenied(auditActor, auditResource, 'No access request handler configured');
      return {
        granted: false,
        permissionLevel: PermissionLevel.Gated,
        method: 'denied',
        denialReason: 'Access request handler not configured',
      };
    }

    // Create the access request
    const request = this.createAccessRequest(requester, resource, purpose);
    this.pendingRequests.set(request.id, request);

    try {
      // Wait for user response
      const response = await Promise.race([
        this.accessRequestHandler(request),
        this.timeout(this.requestTimeoutMs),
      ]) as AccessResponse | null;

      // Update request with response
      request.response = response ?? undefined;
      request.status = this.getStatusFromResponse(response);

      if (response && this.isApproved(response)) {
        // Cache the approval
        if (response.expiresAt) {
          const cacheKey = `${requester.id}:${resource.uri}`;
          this.approvalCache.set(cacheKey, {
            expiresAt: new Date(response.expiresAt),
            requesterId: requester.id,
          });
        }

        await this.auditLogger.logAccessGranted(
          auditActor,
          auditResource,
          'user_approved',
          response.expiresAt?.toString()
        );

        return {
          granted: true,
          permissionLevel: PermissionLevel.Gated,
          method: 'user_approved',
          expiresAt: response.expiresAt ? new Date(response.expiresAt) : undefined,
          request,
        };
      } else {
        const reason = response?.reason ?? 'User denied access';
        await this.auditLogger.logAccessDenied(auditActor, auditResource, reason);

        return {
          granted: false,
          permissionLevel: PermissionLevel.Gated,
          method: 'denied',
          denialReason: reason,
          request,
        };
      }
    } catch (error) {
      request.status = 'expired';
      await this.auditLogger.logAccessDenied(auditActor, auditResource, 'Request timed out');

      return {
        granted: false,
        permissionLevel: PermissionLevel.Gated,
        method: 'denied',
        denialReason: 'Access request timed out',
        request,
      };
    } finally {
      this.pendingRequests.delete(request.id);
    }
  }

  /**
   * Create an access request
   */
  private createAccessRequest(
    requester: RequesterInfo,
    resource: ResourceInfo,
    purpose: string
  ): AccessRequest {
    const now = new Date();
    return {
      id: uuidv4(),
      requester,
      resource,
      purpose,
      timestamp: now,
      status: 'pending',
      expiresAt: new Date(now.getTime() + this.requestTimeoutMs),
    };
  }

  /**
   * Get status from response
   */
  private getStatusFromResponse(response: AccessResponse | null): AccessRequestStatus {
    if (!response) return 'expired';
    if (response.decision.startsWith('allow')) return 'approved';
    if (response.decision.startsWith('deny')) return 'denied';
    return 'expired';
  }

  /**
   * Check if response is an approval
   */
  private isApproved(response: AccessResponse): boolean {
    return response.decision === 'allow_once' ||
           response.decision === 'allow_timed' ||
           response.decision === 'allow_session';
  }

  /**
   * Timeout promise
   */
  private timeout(ms: number): Promise<null> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), ms)
    );
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): AccessRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Clear expired approvals from cache
   */
  clearExpiredApprovals(): void {
    const now = new Date();
    for (const [key, value] of this.approvalCache) {
      if (value.expiresAt <= now) {
        this.approvalCache.delete(key);
      }
    }
  }

  /**
   * Revoke an approval
   */
  revokeApproval(requesterId: string, resourceUri: string): boolean {
    const cacheKey = `${requesterId}:${resourceUri}`;
    return this.approvalCache.delete(cacheKey);
  }

  /**
   * Revoke all approvals for a requester
   */
  revokeAllApprovals(requesterId: string): number {
    let count = 0;
    for (const [key, value] of this.approvalCache) {
      if (value.requesterId === requesterId) {
        this.approvalCache.delete(key);
        count++;
      }
    }
    return count;
  }
}
