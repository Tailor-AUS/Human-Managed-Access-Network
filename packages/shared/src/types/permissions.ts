/**
 * HMAN Permission Levels (The "Gate" System)
 *
 * Level 0 - Open: Auto-shared with any connected AI
 * Level 1 - Standard: Shared with logging; user notified post-hoc
 * Level 2 - Gated: Requires tap-to-approve; push notification
 * Level 3 - Locked: Never shared via MCP; manual copy only
 */
export enum PermissionLevel {
  /** Auto-shared with any connected AI */
  Open = 0,
  /** Shared with logging; user notified post-hoc */
  Standard = 1,
  /** Requires tap-to-approve; push notification */
  Gated = 2,
  /** Never shared via MCP; manual copy only */
  Locked = 3,
}

export interface Permission {
  /** The permission level for this resource */
  level: PermissionLevel;
  /** Human-readable description of what this permission allows */
  description: string;
  /** Whether this permission can be delegated to others */
  delegatable: boolean;
  /** Optional conditions for auto-approval (e.g., time-based, amount-based) */
  autoApproveConditions?: AutoApproveCondition[];
}

export interface AutoApproveCondition {
  type: 'time_window' | 'amount_limit' | 'requester_whitelist' | 'frequency_limit';
  params: Record<string, unknown>;
}

export interface TimeWindowCondition extends AutoApproveCondition {
  type: 'time_window';
  params: {
    startHour: number; // 0-23
    endHour: number; // 0-23
    daysOfWeek: number[]; // 0-6, Sunday = 0
    timezone: string;
  };
}

export interface AmountLimitCondition extends AutoApproveCondition {
  type: 'amount_limit';
  params: {
    maxAmount: number;
    currency: string;
    period: 'per_request' | 'daily' | 'weekly' | 'monthly';
  };
}

export interface RequesterWhitelistCondition extends AutoApproveCondition {
  type: 'requester_whitelist';
  params: {
    allowedRequesters: string[]; // AI model identifiers or user IDs
  };
}

export interface FrequencyLimitCondition extends AutoApproveCondition {
  type: 'frequency_limit';
  params: {
    maxRequests: number;
    period: 'hour' | 'day' | 'week';
  };
}

export type PermissionCondition =
  | TimeWindowCondition
  | AmountLimitCondition
  | RequesterWhitelistCondition
  | FrequencyLimitCondition;
