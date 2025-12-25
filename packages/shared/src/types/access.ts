import type { PermissionLevel } from './permissions.js';

/**
 * Access Request - When an AI requests access to gated data
 */
export interface AccessRequest {
  /** Unique request identifier */
  id: string;
  /** The AI/requester making the request */
  requester: RequesterInfo;
  /** The resource being requested */
  resource: ResourceInfo;
  /** Purpose/context for the request */
  purpose: string;
  /** When the request was made */
  timestamp: Date;
  /** Current status of the request */
  status: AccessRequestStatus;
  /** When the request expires if not acted upon */
  expiresAt: Date;
  /** If approved, when the approval expires */
  approvalExpiresAt?: Date;
  /** User's response (if any) */
  response?: AccessResponse;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'cancelled';

export interface RequesterInfo {
  /** Unique identifier for the requester */
  id: string;
  /** Type of requester */
  type: 'ai_model' | 'bot' | 'delegate' | 'application';
  /** Human-readable name */
  name: string;
  /** Additional metadata about the requester */
  metadata?: Record<string, unknown>;
}

export interface ResourceInfo {
  /** MCP resource URI */
  uri: string;
  /** Human-readable resource name */
  name: string;
  /** Vault containing this resource */
  vaultId: string;
  /** Permission level of this resource */
  permissionLevel: PermissionLevel;
  /** Brief description of what's being accessed */
  description?: string;
}

export interface AccessResponse {
  /** The decision made */
  decision: 'allow_once' | 'allow_timed' | 'allow_session' | 'deny' | 'deny_always';
  /** Who made the decision (user ID or delegate ID) */
  respondedBy: string;
  /** When the response was made */
  respondedAt: Date;
  /** For timed approvals, when it expires */
  expiresAt?: Date;
  /** Optional reason/note */
  reason?: string;
}

/**
 * Delegation - Granting scoped access to another user
 */
export interface Delegation {
  /** Unique delegation identifier */
  id: string;
  /** User who created the delegation */
  grantor: string;
  /** User receiving delegated access */
  delegate: DelegateInfo;
  /** Vault(s) being delegated */
  vaultIds: string[];
  /** Specific permissions granted */
  permissions: DelegatedPermission[];
  /** Conditions that must be met */
  conditions?: DelegationCondition[];
  /** When the delegation was created */
  createdAt: Date;
  /** When the delegation expires */
  expiresAt: Date;
  /** Current status */
  status: DelegationStatus;
  /** Whether the delegate has accepted */
  acceptedAt?: Date;
  /** If revoked, when and why */
  revokedAt?: Date;
  revocationReason?: string;
}

export type DelegationStatus = 'pending' | 'active' | 'expired' | 'revoked';

export interface DelegateInfo {
  /** Delegate's HMAN user ID */
  id: string;
  /** Delegate's display name */
  displayName: string;
  /** Delegate's HMAN handle (e.g., @jane.hman) */
  handle: string;
  /** Public key for E2EE communication */
  publicKey: string;
}

export interface DelegatedPermission {
  /** Resource pattern (glob-style, e.g., 'finance/bills/*') */
  resourcePattern: string;
  /** Actions allowed */
  actions: DelegatedAction[];
  /** Maximum permission level the delegate can approve */
  maxApprovalLevel: PermissionLevel;
}

export type DelegatedAction = 'view' | 'approve_payment' | 'respond_to_request' | 'export';

export interface DelegationCondition {
  type: 'amount_limit' | 'time_window' | 'require_notification';
  params: Record<string, unknown>;
}

export interface AmountLimitDelegationCondition extends DelegationCondition {
  type: 'amount_limit';
  params: {
    maxAmount: number;
    currency: string;
  };
}

export interface TimeWindowDelegationCondition extends DelegationCondition {
  type: 'time_window';
  params: {
    startHour: number;
    endHour: number;
    timezone: string;
  };
}

export interface RequireNotificationCondition extends DelegationCondition {
  type: 'require_notification';
  params: {
    /** Always notify grantor when delegate acts */
    notifyOnAction: boolean;
    /** Wait for grantor confirmation before delegate action takes effect */
    requireConfirmation: boolean;
    /** Confirmation timeout in minutes */
    confirmationTimeoutMinutes: number;
  };
}
