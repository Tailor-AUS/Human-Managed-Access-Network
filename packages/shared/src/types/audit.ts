import type { PermissionLevel } from './permissions.js';

/**
 * Audit Log Entry - All access is logged locally
 */
export interface AuditLogEntry {
  /** Unique entry identifier */
  id: string;
  /** When this action occurred */
  timestamp: Date;
  /** Type of action */
  action: AuditAction;
  /** Who performed the action */
  actor: AuditActor;
  /** Resource that was accessed/modified */
  resource: AuditResource;
  /** The outcome of the action */
  outcome: AuditOutcome;
  /** Additional context */
  metadata?: Record<string, unknown>;
  /** Hash of previous log entry (for integrity) */
  previousEntryHash?: string;
  /** Hash of this entry */
  entryHash: string;
}

export type AuditAction =
  | 'access_request'
  | 'access_granted'
  | 'access_denied'
  | 'data_read'
  | 'data_write'
  | 'data_delete'
  | 'vault_unlock'
  | 'vault_lock'
  | 'delegation_created'
  | 'delegation_accepted'
  | 'delegation_revoked'
  | 'delegation_expired'
  | 'payment_requested'
  | 'payment_approved'
  | 'payment_denied'
  | 'payment_executed'
  | 'export_requested'
  | 'export_completed'
  | 'permission_changed'
  | 'key_rotation';

export interface AuditActor {
  /** Actor type */
  type: 'user' | 'ai_model' | 'delegate' | 'bot' | 'system';
  /** Actor identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** For AI models, which model was used */
  modelId?: string;
  /** IP address or device identifier (for security) */
  deviceInfo?: string;
}

export interface AuditResource {
  /** MCP resource URI */
  uri: string;
  /** Vault ID */
  vaultId: string;
  /** Item ID (if applicable) */
  itemId?: string;
  /** Permission level at time of access */
  permissionLevel: PermissionLevel;
  /** Brief description */
  description?: string;
}

export interface AuditOutcome {
  /** Whether the action succeeded */
  success: boolean;
  /** Reason for failure (if applicable) */
  failureReason?: string;
  /** For access, what was the approval method */
  approvalMethod?: 'auto' | 'user_approved' | 'delegate_approved' | 'pre_authorized';
  /** Duration of access granted (if applicable) */
  accessDuration?: string;
}

/**
 * Audit Query - For searching audit logs
 */
export interface AuditQuery {
  /** Filter by time range */
  startTime?: Date;
  endTime?: Date;
  /** Filter by action types */
  actions?: AuditAction[];
  /** Filter by actor */
  actorId?: string;
  actorType?: AuditActor['type'];
  /** Filter by resource */
  vaultId?: string;
  resourceUri?: string;
  /** Filter by outcome */
  successOnly?: boolean;
  failureOnly?: boolean;
  /** Pagination */
  limit?: number;
  offset?: number;
  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

export interface AuditSummary {
  /** Time period covered */
  startTime: Date;
  endTime: Date;
  /** Total actions */
  totalActions: number;
  /** Breakdown by action type */
  actionCounts: Record<AuditAction, number>;
  /** Breakdown by actor type */
  actorTypeCounts: Record<AuditActor['type'], number>;
  /** Success/failure counts */
  successCount: number;
  failureCount: number;
  /** Most accessed resources */
  topResources: Array<{
    uri: string;
    accessCount: number;
  }>;
  /** Most active actors */
  topActors: Array<{
    id: string;
    name: string;
    actionCount: number;
  }>;
}
