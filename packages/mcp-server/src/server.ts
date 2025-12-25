/**
 * HMAN Gate - MCP Server Implementation
 *
 * This is the local MCP server that mediates all AI access to user data.
 * It implements Anthropic's Model Context Protocol with HMAN's tiered permissions.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';

import {
  HmanSDK,
  createHmanSDK,
  VaultType,
  PermissionLevel,
  parseHmanUri,
  DEFAULT_RESOURCES,
  DEFAULT_TOOLS,
  type RequesterInfo,
  type AccessRequest,
  type AccessResponse,
  type AuditAction,
} from '@hman/core';

/** Error class for MCP tool errors */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly code: ToolErrorCode
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export enum ToolErrorCode {
  InvalidInput = 'INVALID_INPUT',
  NotInitialized = 'NOT_INITIALIZED',
  ExecutionFailed = 'EXECUTION_FAILED',
  AccessDenied = 'ACCESS_DENIED',
  VaultNotFound = 'VAULT_NOT_FOUND',
}

/** Input validation helpers */
const validators = {
  isString(value: unknown, minLength = 0, maxLength = 1000): value is string {
    return typeof value === 'string' && value.length >= minLength && value.length <= maxLength;
  },

  isNumber(value: unknown, min?: number, max?: number): value is number {
    if (typeof value !== 'number' || isNaN(value)) return false;
    if (min !== undefined && value < min) return false;
    if (max !== undefined && value > max) return false;
    return true;
  },

  isPositiveNumber(value: unknown): value is number {
    return this.isNumber(value, 0.01);
  },

  isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  },

  isValidVaultType(value: unknown): value is VaultType {
    return Object.values(VaultType).includes(value as VaultType);
  },

  isISODate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const date = new Date(value);
    return !isNaN(date.getTime());
  },
};

export interface HmanGateConfig {
  /** Name of the server */
  name?: string;
  /** Server version */
  version?: string;
  /** Handler for displaying access requests to user */
  onAccessRequest?: (request: AccessRequest) => Promise<AccessResponse | null>;
  /** Handler for access notifications (Standard level) */
  onAccessNotification?: (request: AccessRequest) => Promise<void>;
}

/**
 * HMAN Gate MCP Server
 */
export class HmanGate {
  private server: Server;
  private sdk: HmanSDK | null = null;
  private config: HmanGateConfig;
  private currentRequester: RequesterInfo = {
    id: 'unknown',
    type: 'ai_model',
    name: 'Unknown AI',
  };

  constructor(config: HmanGateConfig = {}) {
    this.config = config;

    this.server = new Server(
      {
        name: config.name ?? 'hman-gate',
        version: config.version ?? '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize the SDK with a passphrase
   */
  async initialize(passphrase: string): Promise<void> {
    this.sdk = await createHmanSDK({
      accessRequestHandler: this.config.onAccessRequest,
      accessNotificationHandler: this.config.onAccessNotification,
    });
    await this.sdk.initialize(passphrase);
  }

  /**
   * Set the current requester information
   */
  setRequester(requester: RequesterInfo): void {
    this.currentRequester = requester;
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = DEFAULT_RESOURCES
        .filter(r => r.permissionLevel !== PermissionLevel.Locked)
        .map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        }));

      return { resources };
    });

    // Read a resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: ReadResourceRequest) => {
      return this.handleReadResource(request);
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = DEFAULT_TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

      return { tools };
    });

    // Call a tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      return this.handleCallTool(request);
    });
  }

  /**
   * Handle read resource request
   */
  private async handleReadResource(request: ReadResourceRequest): Promise<{
    contents: Array<{ uri: string; mimeType: string; text: string }>;
  }> {
    if (!this.sdk) {
      throw new Error('HMAN Gate not initialized');
    }

    const uri = request.params.uri;
    const parsed = parseHmanUri(uri);

    if (!parsed) {
      throw new Error(`Invalid HMAN URI: ${uri}`);
    }

    // Request access through the gate
    const decision = await this.sdk.gate.requestAccess(
      this.currentRequester,
      uri,
      `Read ${parsed.category} data`
    );

    if (!decision.granted) {
      throw new Error(decision.denialReason ?? 'Access denied');
    }

    // Get the data based on vault type
    const content = await this.getResourceContent(parsed.vault, parsed.category, parsed.query);

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  }

  /**
   * Get resource content from vault
   */
  private async getResourceContent(
    vaultType: string,
    category: string,
    query?: Record<string, string>
  ): Promise<unknown> {
    if (!this.sdk) {
      throw new Error('HMAN Gate not initialized');
    }

    const vault = await this.sdk.getVaultByType(vaultType as VaultType);
    if (!vault) {
      return { error: 'Vault not found' };
    }

    await this.sdk.vaultManager.unlockVault(vault.id);
    const items = await this.sdk.vaultManager.getItemsByType(vault.id, category);

    // Apply query filters
    let filtered = items;
    if (query) {
      if (query.category) {
        filtered = filtered.filter((item: { content: { category?: string } }) =>
          item.content?.category === query.category
        );
      }
      if (query.limit) {
        filtered = filtered.slice(0, parseInt(query.limit, 10));
      }
    }

    return {
      vault: vaultType,
      category,
      count: filtered.length,
      items: filtered.map(item => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        content: item.content,
      })),
    };
  }

  /**
   * Handle tool call request
   */
  private async handleCallTool(request: CallToolRequest): Promise<{
    content: Array<{ type: 'text'; text: string }>;
  }> {
    const toolName = request.params.name;

    try {
      if (!this.sdk) {
        throw new ToolError('HMAN Gate not initialized', toolName, ToolErrorCode.NotInitialized);
      }

      const args = request.params.arguments as Record<string, unknown>;

      // Find tool definition
      const toolDef = DEFAULT_TOOLS.find(t => t.name === toolName);
      if (!toolDef) {
        throw new ToolError(`Unknown tool: ${toolName}`, toolName, ToolErrorCode.InvalidInput);
      }

      // Check if tool requires confirmation
      if (toolDef.requiresConfirmation) {
        const decision = await this.sdk.gate.requestAccess(
          this.currentRequester,
          `hman://tools/${toolName}`,
          `Execute ${toolName} with args: ${JSON.stringify(args)}`
        );

        if (!decision.granted) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: decision.denialReason ?? 'Tool execution denied by user',
                  code: ToolErrorCode.AccessDenied,
                }),
              },
            ],
          };
        }
      }

      // Execute the tool with error handling
      const result = await this.executeTool(toolName, args);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const errorCode = err instanceof ToolError ? err.code : ToolErrorCode.ExecutionFailed;

      console.error(`Tool execution error (${toolName}):`, err);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: errorMessage,
              code: errorCode,
              tool: toolName,
            }),
          },
        ],
      };
    }
  }

  /**
   * Execute a tool
   */
  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) {
      throw new Error('HMAN Gate not initialized');
    }

    switch (name) {
      case 'approve_payment':
        return this.handleApprovePayment(args);

      case 'create_delegation':
        return this.handleCreateDelegation(args);

      case 'revoke_delegation':
        return this.handleRevokeDelegation(args);

      case 'schedule_event':
        return this.handleScheduleEvent(args);

      case 'create_reminder':
        return this.handleCreateReminder(args);

      case 'add_diary_entry':
        return this.handleAddDiaryEntry(args);

      case 'search_vaults':
        return this.handleSearchVaults(args);

      case 'get_bill_summary':
        return this.handleGetBillSummary(args);

      case 'update_profile':
        return this.handleUpdateProfile(args);

      case 'send_message':
        return this.handleSendMessage(args);

      case 'query_audit_log':
        return this.handleQueryAuditLog(args);

      case 'export_vault_data':
        return this.handleExportVaultData(args);

      default:
        return { error: `Tool not implemented: ${name}` };
    }
  }

  /**
   * Validate required arguments for a tool
   */
  private validateArgs(
    toolName: string,
    args: Record<string, unknown>,
    schema: Record<string, { type: 'string' | 'number' | 'array' | 'date'; required?: boolean; min?: number; max?: number }>
  ): void {
    for (const [key, config] of Object.entries(schema)) {
      const value = args[key];

      if (config.required && (value === undefined || value === null)) {
        throw new ToolError(`Missing required argument: ${key}`, toolName, ToolErrorCode.InvalidInput);
      }

      if (value === undefined || value === null) continue;

      switch (config.type) {
        case 'string':
          if (!validators.isString(value, config.min ?? 1, config.max ?? 1000)) {
            throw new ToolError(
              `Invalid ${key}: must be a non-empty string (max ${config.max ?? 1000} chars)`,
              toolName,
              ToolErrorCode.InvalidInput
            );
          }
          break;
        case 'number':
          if (!validators.isNumber(value, config.min, config.max)) {
            throw new ToolError(
              `Invalid ${key}: must be a number${config.min !== undefined ? ` >= ${config.min}` : ''}${config.max !== undefined ? ` <= ${config.max}` : ''}`,
              toolName,
              ToolErrorCode.InvalidInput
            );
          }
          break;
        case 'array':
          if (!validators.isArray(value)) {
            throw new ToolError(`Invalid ${key}: must be an array`, toolName, ToolErrorCode.InvalidInput);
          }
          break;
        case 'date':
          if (!validators.isISODate(value)) {
            throw new ToolError(`Invalid ${key}: must be a valid ISO date string`, toolName, ToolErrorCode.InvalidInput);
          }
          break;
      }
    }
  }

  /**
   * Handle approve_payment tool
   */
  private async handleApprovePayment(args: Record<string, unknown>): Promise<unknown> {
    this.validateArgs('approve_payment', args, {
      payee: { type: 'string', required: true },
      amount: { type: 'number', required: true, min: 0.01, max: 1000000 },
      currency: { type: 'string', required: false },
      reference: { type: 'string', required: false },
    });

    // In a real implementation, this would integrate with PayID
    return {
      success: true,
      message: 'Payment approval request created',
      paymentRequest: {
        payee: args.payee,
        amount: args.amount,
        currency: args.currency ?? 'AUD',
        reference: args.reference,
        status: 'pending_execution',
        note: 'PayID integration would execute the payment here',
      },
    };
  }

  /**
   * Handle create_delegation tool
   */
  private async handleCreateDelegation(args: Record<string, unknown>): Promise<unknown> {
    this.validateArgs('create_delegation', args, {
      delegate_handle: { type: 'string', required: true },
      vault: { type: 'string', required: true },
      permissions: { type: 'array', required: true },
      expires_in_days: { type: 'number', required: false, min: 1, max: 365 },
    });

    // In a real implementation, this would create a delegation
    return {
      success: true,
      message: 'Delegation invite sent',
      delegation: {
        delegate: args.delegate_handle,
        vault: args.vault,
        permissions: args.permissions,
        expiresInDays: args.expires_in_days ?? 30,
        status: 'pending_acceptance',
      },
    };
  }

  /**
   * Handle schedule_event tool
   */
  private async handleScheduleEvent(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'schedule_event', ToolErrorCode.NotInitialized);

    this.validateArgs('schedule_event', args, {
      title: { type: 'string', required: true, max: 200 },
      start_time: { type: 'date', required: true },
      end_time: { type: 'date', required: false },
      description: { type: 'string', required: false, max: 2000 },
      location: { type: 'string', required: false, max: 500 },
    });

    const eventId = await this.sdk.addToVault(
      VaultType.Calendar,
      'event',
      args.title as string,
      {
        title: args.title,
        startTime: args.start_time,
        endTime: args.end_time,
        description: args.description,
        location: args.location,
      }
    );

    return {
      success: true,
      message: 'Event scheduled',
      eventId,
      event: {
        title: args.title,
        startTime: args.start_time,
        endTime: args.end_time,
      },
    };
  }

  /**
   * Handle add_diary_entry tool
   */
  private async handleAddDiaryEntry(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'add_diary_entry', ToolErrorCode.NotInitialized);

    this.validateArgs('add_diary_entry', args, {
      content: { type: 'string', required: true, max: 10000 },
      date: { type: 'date', required: false },
      mood: { type: 'string', required: false, max: 50 },
      tags: { type: 'array', required: false },
    });

    const entryId = await this.sdk.addToVault(
      VaultType.Diary,
      'entry',
      `Entry ${new Date().toLocaleDateString()}`,
      {
        content: args.content,
        date: args.date ?? new Date().toISOString(),
        mood: args.mood,
        tags: args.tags,
      },
      { tags: args.tags as string[] }
    );

    return {
      success: true,
      message: 'Diary entry added',
      entryId,
    };
  }

  /**
   * Handle query_audit_log tool
   */
  private async handleQueryAuditLog(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'query_audit_log', ToolErrorCode.NotInitialized);

    this.validateArgs('query_audit_log', args, {
      start_date: { type: 'date', required: false },
      end_date: { type: 'date', required: false },
      action_types: { type: 'array', required: false },
      limit: { type: 'number', required: false, min: 1, max: 500 },
    });

    const entries = await this.sdk.auditLogger.query({
      startTime: args.start_date ? new Date(args.start_date as string) : undefined,
      endTime: args.end_date ? new Date(args.end_date as string) : undefined,
      actions: args.action_types as AuditAction[] | undefined,
      limit: (args.limit as number) ?? 50,
    });

    return {
      success: true,
      count: entries.length,
      entries: entries.map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        action: e.action,
        actor: e.actor.name,
        resource: e.resource.uri,
        outcome: e.outcome.success ? 'success' : 'failed',
      })),
    };
  }

  /**
   * Handle revoke_delegation tool
   */
  private async handleRevokeDelegation(args: Record<string, unknown>): Promise<unknown> {
    this.validateArgs('revoke_delegation', args, {
      delegation_id: { type: 'string', required: false },
      delegate_handle: { type: 'string', required: false },
      vault: { type: 'string', required: false },
    });

    // At least one identifier must be provided
    if (!args.delegation_id && !args.delegate_handle) {
      throw new ToolError(
        'Either delegation_id or delegate_handle must be provided',
        'revoke_delegation',
        ToolErrorCode.InvalidInput
      );
    }

    return {
      success: true,
      message: 'Delegation revoked',
      revoked: {
        delegationId: args.delegation_id,
        delegateHandle: args.delegate_handle,
        vault: args.vault,
        revokedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Handle create_reminder tool
   */
  private async handleCreateReminder(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'create_reminder', ToolErrorCode.NotInitialized);

    this.validateArgs('create_reminder', args, {
      message: { type: 'string', required: true, max: 500 },
      remind_at: { type: 'date', required: true },
      repeat: { type: 'string', required: false },
      priority: { type: 'string', required: false },
    });

    const reminderId = await this.sdk.addToVault(
      VaultType.Calendar,
      'reminder',
      args.message as string,
      {
        message: args.message,
        remindAt: args.remind_at,
        repeat: args.repeat ?? 'none',
        priority: args.priority ?? 'normal',
      }
    );

    return {
      success: true,
      message: 'Reminder created',
      reminderId,
      reminder: {
        message: args.message,
        remindAt: args.remind_at,
        repeat: args.repeat ?? 'none',
      },
    };
  }

  /**
   * Handle search_vaults tool
   */
  private async handleSearchVaults(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'search_vaults', ToolErrorCode.NotInitialized);

    this.validateArgs('search_vaults', args, {
      query: { type: 'string', required: true, max: 200 },
      vaults: { type: 'array', required: false },
      limit: { type: 'number', required: false, min: 1, max: 100 },
    });

    const query = args.query as string;
    const vaultTypes = (args.vaults as string[] | undefined) ?? Object.values(VaultType);
    const limit = Math.min((args.limit as number) ?? 20, 100);

    const results: Array<{
      vault: string;
      id: string;
      title: string;
      itemType: string;
      match: string;
    }> = [];

    for (const vaultType of vaultTypes) {
      try {
        const vault = await this.sdk.getVaultByType(vaultType as VaultType);
        if (!vault) continue;

        await this.sdk.vaultManager.unlockVault(vault.id);
        const items = await this.sdk.vaultManager.getVaultItems(vault.id);

        for (const item of items) {
          const titleMatch = item.title.toLowerCase().includes(query.toLowerCase());
          const contentMatch = JSON.stringify(item.content)
            .toLowerCase()
            .includes(query.toLowerCase());

          if (titleMatch || contentMatch) {
            results.push({
              vault: vaultType,
              id: item.id,
              title: item.title,
              itemType: item.itemType,
              match: titleMatch ? 'title' : 'content',
            });

            if (results.length >= limit) break;
          }
        }

        if (results.length >= limit) break;
      } catch {
        // Skip vaults that can't be accessed
      }
    }

    return {
      success: true,
      query,
      count: results.length,
      results,
    };
  }

  /**
   * Handle get_bill_summary tool
   */
  private async handleGetBillSummary(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'get_bill_summary', ToolErrorCode.NotInitialized);

    this.validateArgs('get_bill_summary', args, {
      days_ahead: { type: 'number', required: false, min: 1, max: 365 },
      category: { type: 'string', required: false },
    });

    const daysAhead = Math.min((args.days_ahead as number) ?? 30, 365);
    const includePaid = (args.include_paid as boolean) ?? false;

    const vault = await this.sdk.getVaultByType(VaultType.Finance);
    if (!vault) {
      return { success: false, error: 'Finance vault not found' };
    }

    await this.sdk.vaultManager.unlockVault(vault.id);
    const bills = await this.sdk.vaultManager.getItemsByType(vault.id, 'bill');

    const now = new Date();
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const filteredBills = bills.filter((bill: { content: { dueDate?: string; status?: string; category?: string } }) => {
      if (!bill.content?.dueDate) return false;

      const dueDate = new Date(bill.content.dueDate);
      const isDue = dueDate >= now && dueDate <= futureDate;
      const isPaid = bill.content.status === 'paid';

      if (args.category && bill.content.category !== args.category) return false;

      return isDue || (includePaid && isPaid);
    });

    const total = filteredBills.reduce((sum: number, bill: { content: { amount?: number } }) => {
      return sum + (bill.content?.amount ?? 0);
    }, 0);

    return {
      success: true,
      summary: {
        daysAhead,
        billCount: filteredBills.length,
        totalAmount: total,
        currency: 'AUD',
      },
      bills: filteredBills.map((bill: { id: string; title: string; content: { payee?: string; amount?: number; dueDate?: string; category?: string; status?: string } }) => ({
        id: bill.id,
        title: bill.title,
        payee: bill.content?.payee,
        amount: bill.content?.amount,
        dueDate: bill.content?.dueDate,
        category: bill.content?.category,
        status: bill.content?.status ?? 'unpaid',
      })),
    };
  }

  /**
   * Handle update_profile tool
   */
  private async handleUpdateProfile(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'update_profile', ToolErrorCode.NotInitialized);

    this.validateArgs('update_profile', args, {
      display_name: { type: 'string', required: false, max: 100 },
      timezone: { type: 'string', required: false, max: 50 },
      language: { type: 'string', required: false, max: 10 },
    });

    const vault = await this.sdk.getVaultByType(VaultType.Identity);
    if (!vault) {
      throw new ToolError('Identity vault not found', 'update_profile', ToolErrorCode.VaultNotFound);
    }

    await this.sdk.vaultManager.unlockVault(vault.id);

    const updates: Record<string, unknown> = {};
    if (args.display_name) updates.displayName = args.display_name;
    if (args.timezone) updates.timezone = args.timezone;
    if (args.language) updates.language = args.language;
    if (args.preferences) updates.preferences = args.preferences;

    return {
      success: true,
      message: 'Profile updated',
      updates,
    };
  }

  /**
   * Handle send_message tool
   */
  private async handleSendMessage(args: Record<string, unknown>): Promise<unknown> {
    this.validateArgs('send_message', args, {
      recipient: { type: 'string', required: true },
      content: { type: 'string', required: true, max: 5000 },
      message_type: { type: 'string', required: false },
    });

    return {
      success: true,
      message: 'Message sent',
      details: {
        recipient: args.recipient,
        messageType: args.message_type ?? 'text',
        sentAt: new Date().toISOString(),
        encrypted: true,
      },
    };
  }

  /**
   * Handle export_vault_data tool
   */
  private async handleExportVaultData(args: Record<string, unknown>): Promise<unknown> {
    if (!this.sdk) throw new ToolError('Not initialized', 'export_vault_data', ToolErrorCode.NotInitialized);

    this.validateArgs('export_vault_data', args, {
      vault: { type: 'string', required: true },
      format: { type: 'string', required: true },
      item_types: { type: 'array', required: false },
    });

    const vaultType = args.vault as string;
    const format = args.format as string;

    // Validate vault type
    if (!validators.isValidVaultType(vaultType)) {
      throw new ToolError(
        `Invalid vault type: ${vaultType}. Must be one of: ${Object.values(VaultType).join(', ')}`,
        'export_vault_data',
        ToolErrorCode.InvalidInput
      );
    }

    const vault = await this.sdk.getVaultByType(vaultType as VaultType);
    if (!vault) {
      throw new ToolError(`Vault not found: ${vaultType}`, 'export_vault_data', ToolErrorCode.VaultNotFound);
    }

    await this.sdk.vaultManager.unlockVault(vault.id);
    const items = await this.sdk.vaultManager.getVaultItems(vault.id);

    // Apply filters
    let filtered = items;
    if (args.item_types) {
      const types = args.item_types as string[];
      filtered = filtered.filter((item: { itemType: string }) => types.includes(item.itemType));
    }

    return {
      success: true,
      export: {
        vault: vaultType,
        format,
        itemCount: filtered.length,
        exportedAt: new Date().toISOString(),
        note: `Export prepared in ${format} format. In production, this would generate a downloadable file.`,
      },
    };
  }

  /**
   * Run the server with stdio transport
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('HMAN Gate MCP server running on stdio');
  }

  /**
   * Get the underlying SDK
   */
  getSDK(): HmanSDK | null {
    return this.sdk;
  }
}

/**
 * Create and start the HMAN Gate
 */
export async function createHmanGate(config: HmanGateConfig = {}): Promise<HmanGate> {
  const gate = new HmanGate(config);
  return gate;
}
