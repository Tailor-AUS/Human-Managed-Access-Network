import type { PermissionLevel } from './permissions.js';

/**
 * MCP-specific types for HMAN Gate
 */

/**
 * HMAN Resource URI format:
 * hman://{vault}/{category}/{item}
 *
 * Examples:
 * - hman://identity/profile
 * - hman://finance/transactions
 * - hman://finance/transactions/tx-123
 * - hman://health/records
 * - hman://calendar/events
 */
export interface HmanResourceUri {
  /** The vault type */
  vault: string;
  /** Category within the vault */
  category: string;
  /** Specific item ID (optional) */
  itemId?: string;
  /** Query parameters */
  query?: Record<string, string>;
}

/**
 * Parsed HMAN URI
 */
export function parseHmanUri(uri: string): HmanResourceUri | null {
  const match = uri.match(/^hman:\/\/([^/]+)\/([^/?]+)(?:\/([^?]+))?(?:\?(.+))?$/);
  if (!match) return null;

  const [, vault, category, itemId, queryString] = match;
  const query: Record<string, string> = {};

  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key && value) {
        query[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  return { vault, category, itemId, query: Object.keys(query).length > 0 ? query : undefined };
}

/**
 * Build an HMAN URI from components
 */
export function buildHmanUri(components: HmanResourceUri): string {
  let uri = `hman://${components.vault}/${components.category}`;
  if (components.itemId) {
    uri += `/${components.itemId}`;
  }
  if (components.query && Object.keys(components.query).length > 0) {
    const queryString = Object.entries(components.query)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    uri += `?${queryString}`;
  }
  return uri;
}

/**
 * Resource definition for MCP
 */
export interface HmanResourceDefinition {
  /** MCP resource URI */
  uri: string;
  /** Human-readable name */
  name: string;
  /** Description for AI to understand what this resource contains */
  description: string;
  /** Permission level */
  permissionLevel: PermissionLevel;
  /** MIME type of the resource content */
  mimeType: string;
  /** Whether this resource supports subscriptions */
  subscribable?: boolean;
  /** Schema for the resource data (JSON Schema) */
  schema?: Record<string, unknown>;
}

/**
 * Default resource definitions for HMAN vaults
 */
export const DEFAULT_RESOURCES: HmanResourceDefinition[] = [
  // Identity vault - mostly Open
  {
    uri: 'hman://identity/profile',
    name: 'User Profile',
    description: 'Basic user profile including display name, language preference, and timezone',
    permissionLevel: PermissionLevel.Open,
    mimeType: 'application/json',
  },

  // Calendar vault - Standard
  {
    uri: 'hman://calendar/events',
    name: 'Calendar Events',
    description: 'User calendar events including meetings, appointments, and reminders',
    permissionLevel: PermissionLevel.Standard,
    mimeType: 'application/json',
    subscribable: true,
  },

  // Diary vault - Standard
  {
    uri: 'hman://diary/entries',
    name: 'Diary Entries',
    description: 'Personal diary and journal entries',
    permissionLevel: PermissionLevel.Standard,
    mimeType: 'application/json',
  },

  // Finance vault - Gated
  {
    uri: 'hman://finance/transactions',
    name: 'Financial Transactions',
    description: 'Financial transactions including income, expenses, and transfers',
    permissionLevel: PermissionLevel.Gated,
    mimeType: 'application/json',
  },
  {
    uri: 'hman://finance/bills',
    name: 'Bills',
    description: 'Utility bills and recurring payment obligations',
    permissionLevel: PermissionLevel.Gated,
    mimeType: 'application/json',
  },
  {
    uri: 'hman://finance/tax-returns',
    name: 'Tax Returns',
    description: 'Tax return documents and related financial summaries',
    permissionLevel: PermissionLevel.Gated,
    mimeType: 'application/json',
  },

  // Health vault - Gated
  {
    uri: 'hman://health/records',
    name: 'Health Records',
    description: 'Medical records, prescriptions, and health-related documents',
    permissionLevel: PermissionLevel.Gated,
    mimeType: 'application/json',
  },

  // Secrets vault - Locked (never exposed via MCP)
  {
    uri: 'hman://secrets/passwords',
    name: 'Passwords',
    description: 'Stored passwords and credentials - NEVER accessible via MCP',
    permissionLevel: PermissionLevel.Locked,
    mimeType: 'application/json',
  },
];

/**
 * Tool definitions for MCP
 */
export interface HmanToolDefinition {
  /** Tool name */
  name: string;
  /** Description for AI */
  description: string;
  /** Input schema (JSON Schema) */
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Permission level required to use this tool */
  permissionLevel: PermissionLevel;
  /** Whether this tool requires additional confirmation */
  requiresConfirmation: boolean;
}

/**
 * Default tool definitions for HMAN Gate
 */
export const DEFAULT_TOOLS: HmanToolDefinition[] = [
  {
    name: 'approve_payment',
    description: 'Request user approval for a payment via PayID. The user will receive a notification to approve or deny the payment.',
    inputSchema: {
      type: 'object',
      properties: {
        payee: {
          type: 'string',
          description: 'PayID or name of the payment recipient',
        },
        amount: {
          type: 'number',
          description: 'Payment amount in the specified currency',
        },
        currency: {
          type: 'string',
          description: 'Currency code (e.g., AUD)',
          default: 'AUD',
        },
        reference: {
          type: 'string',
          description: 'Payment reference or description',
        },
        vault_source: {
          type: 'string',
          description: 'Which payment method/account to use from the Finance vault',
        },
      },
      required: ['payee', 'amount', 'reference'],
    },
    permissionLevel: PermissionLevel.Gated,
    requiresConfirmation: true,
  },
  {
    name: 'create_delegation',
    description: 'Delegate access to specific vault data to another HMAN user. The delegate will receive an invitation to accept.',
    inputSchema: {
      type: 'object',
      properties: {
        delegate_handle: {
          type: 'string',
          description: 'HMAN handle of the user to delegate to (e.g., @jane.hman)',
        },
        vault: {
          type: 'string',
          description: 'Vault to delegate access to',
        },
        permissions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permissions to grant (view, approve_payment, etc.)',
        },
        expires_in_days: {
          type: 'number',
          description: 'Number of days until delegation expires',
          default: 30,
        },
        conditions: {
          type: 'object',
          description: 'Optional conditions (amount limits, time windows, etc.)',
        },
      },
      required: ['delegate_handle', 'vault', 'permissions'],
    },
    permissionLevel: PermissionLevel.Gated,
    requiresConfirmation: true,
  },
  {
    name: 'revoke_delegation',
    description: 'Revoke an existing delegation, immediately removing the delegates access.',
    inputSchema: {
      type: 'object',
      properties: {
        delegation_id: {
          type: 'string',
          description: 'ID of the delegation to revoke',
        },
        delegate_handle: {
          type: 'string',
          description: 'HMAN handle of the delegate (alternative to delegation_id)',
        },
        vault: {
          type: 'string',
          description: 'Vault to revoke access from (required if using delegate_handle)',
        },
      },
    },
    permissionLevel: PermissionLevel.Gated,
    requiresConfirmation: true,
  },
  {
    name: 'schedule_event',
    description: 'Add an event to the user calendar. Standard permission level - user will be notified but approval is not required.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Event title',
        },
        start_time: {
          type: 'string',
          description: 'Start time in ISO 8601 format',
        },
        end_time: {
          type: 'string',
          description: 'End time in ISO 8601 format',
        },
        description: {
          type: 'string',
          description: 'Event description',
        },
        location: {
          type: 'string',
          description: 'Event location',
        },
        recurrence: {
          type: 'string',
          description: 'Recurrence rule (daily, weekly, monthly, yearly)',
        },
        reminders: {
          type: 'array',
          items: { type: 'number' },
          description: 'Reminder times in minutes before event',
        },
      },
      required: ['title', 'start_time', 'end_time'],
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'create_reminder',
    description: 'Create a reminder that will notify the user at a specific time.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Reminder message',
        },
        remind_at: {
          type: 'string',
          description: 'When to remind in ISO 8601 format',
        },
        repeat: {
          type: 'string',
          enum: ['none', 'daily', 'weekly', 'monthly'],
          description: 'Repeat interval',
          default: 'none',
        },
        priority: {
          type: 'string',
          enum: ['low', 'normal', 'high'],
          description: 'Priority level',
          default: 'normal',
        },
      },
      required: ['message', 'remind_at'],
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'add_diary_entry',
    description: 'Add an entry to the user diary/journal. Standard permission level.',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Diary entry content',
        },
        date: {
          type: 'string',
          description: 'Date for the entry in ISO 8601 format (defaults to today)',
        },
        mood: {
          type: 'string',
          description: 'Optional mood indicator',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for organization',
        },
      },
      required: ['content'],
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'search_vaults',
    description: 'Search across user vaults for matching content. Returns items that match the query.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query string',
        },
        vaults: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific vaults to search (defaults to all accessible vaults)',
        },
        item_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by item types',
        },
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
          },
          description: 'Date range filter',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return',
          default: 20,
        },
      },
      required: ['query'],
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'get_bill_summary',
    description: 'Get a summary of upcoming bills and payment obligations from the Finance vault.',
    inputSchema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Number of days to look ahead for due bills',
          default: 30,
        },
        include_paid: {
          type: 'boolean',
          description: 'Include recently paid bills',
          default: false,
        },
        category: {
          type: 'string',
          description: 'Filter by bill category (utilities, subscriptions, etc.)',
        },
      },
    },
    permissionLevel: PermissionLevel.Gated,
    requiresConfirmation: false,
  },
  {
    name: 'update_profile',
    description: 'Update user profile information in the Identity vault.',
    inputSchema: {
      type: 'object',
      properties: {
        display_name: {
          type: 'string',
          description: 'Display name',
        },
        timezone: {
          type: 'string',
          description: 'Timezone (e.g., Australia/Sydney)',
        },
        language: {
          type: 'string',
          description: 'Preferred language code (e.g., en-AU)',
        },
        preferences: {
          type: 'object',
          description: 'Additional preferences',
        },
      },
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'send_message',
    description: 'Send an end-to-end encrypted message to another HMAN user or bot.',
    inputSchema: {
      type: 'object',
      properties: {
        recipient: {
          type: 'string',
          description: 'HMAN handle or bot ID of the recipient',
        },
        message: {
          type: 'string',
          description: 'Message content',
        },
        message_type: {
          type: 'string',
          enum: ['text', 'payment_request', 'action_request'],
          description: 'Type of message',
          default: 'text',
        },
        metadata: {
          type: 'object',
          description: 'Additional metadata for the message',
        },
      },
      required: ['recipient', 'message'],
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'query_audit_log',
    description: 'Query the local audit log to see what data has been accessed and by whom.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date for query range (ISO 8601)',
        },
        end_date: {
          type: 'string',
          description: 'End date for query range (ISO 8601)',
        },
        action_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by action types',
        },
        actor: {
          type: 'string',
          description: 'Filter by actor name or ID',
        },
        resource: {
          type: 'string',
          description: 'Filter by resource URI pattern',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of entries to return',
          default: 50,
        },
      },
    },
    permissionLevel: PermissionLevel.Standard,
    requiresConfirmation: false,
  },
  {
    name: 'export_vault_data',
    description: 'Export data from a vault in a specified format. Requires user confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        vault: {
          type: 'string',
          description: 'Vault to export from',
        },
        format: {
          type: 'string',
          enum: ['json', 'csv', 'pdf'],
          description: 'Export format',
          default: 'json',
        },
        item_types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific item types to export',
        },
        date_range: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' },
          },
          description: 'Date range filter',
        },
        include_metadata: {
          type: 'boolean',
          description: 'Include item metadata',
          default: true,
        },
      },
      required: ['vault', 'format'],
    },
    permissionLevel: PermissionLevel.Gated,
    requiresConfirmation: true,
  },
];

// Re-export PermissionLevel for convenience
export { PermissionLevel };
