/**
 * HMAN Signal CLI Interface
 * 
 * A complete Signal-first interface for HMAN.
 * All HMAN operations can be performed via Signal text commands.
 * 
 * Commands:
 *   STATUS - Show current HMAN status
 *   VAULTS - List your encrypted vaults
 *   PENDING - Show pending access requests
 *   APPROVE [id] - Approve an access request
 *   DENY [id] - Deny an access request
 *   HISTORY - Show recent activity
 *   HELP - Show available commands
 *   LOCK - Lock all vaults immediately
 *   EXPORT - Export identity to .hman file
 */

import { SignalService, SignalMessage, createSignalService, HmanSignalBridge } from './signal.js';
import type { AccessRequest, PermissionLevel, VaultType } from '@hman/shared';

// Command types
export type HmanCommand =
  | 'STATUS'
  | 'VAULTS'
  | 'VAULT'
  | 'PENDING'
  | 'APPROVE'
  | 'DENY'
  | 'HISTORY'
  | 'HELP'
  | 'LOCK'
  | 'UNLOCK'
  | 'EXPORT'
  | 'DELEGATE'
  | 'REVOKE'
  | 'AUDIT'
  | 'SETTINGS'
  | 'UNKNOWN';

export interface ParsedCommand {
  command: HmanCommand;
  args: string[];
  raw: string;
}

export interface HmanStatus {
  vaultsCount: number;
  unlockedCount: number;
  pendingRequests: number;
  delegations: number;
  lastActivity?: string;
  signalConnected: boolean;
}

export interface PendingRequest {
  id: string;
  shortId: string;  // Human-friendly ID like "A", "B", "C"
  requester: string;
  requesterType: 'ai_model' | 'human' | 'service';
  resource: string;
  purpose: string;
  timestamp: Date;
  expiresAt?: Date;
}

export interface VaultSummary {
  id: string;
  name: string;
  type: VaultType;
  itemCount: number;
  locked: boolean;
  permissionLevel: PermissionLevel;
}

export interface ActivityEntry {
  timestamp: Date;
  action: string;
  actor: string;
  resource?: string;
  outcome: 'success' | 'denied' | 'error';
}

/**
 * Signal CLI Interface - Complete HMAN control via Signal
 */
export class HmanSignalInterface {
  private signal: SignalService;
  private bridge: HmanSignalBridge;
  private ownerNumber: string;
  
  // State
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private requestIdCounter = 0;

  // Callbacks for SDK integration
  private onStatusRequest?: () => Promise<HmanStatus>;
  private onVaultsRequest?: () => Promise<VaultSummary[]>;
  private onPendingRequest?: () => Promise<PendingRequest[]>;
  private onApprove?: (requestId: string, duration?: number) => Promise<boolean>;
  private onDeny?: (requestId: string, reason?: string) => Promise<boolean>;
  private onHistoryRequest?: (limit?: number) => Promise<ActivityEntry[]>;
  private onLock?: () => Promise<void>;
  private onUnlock?: (passphrase: string) => Promise<boolean>;
  private onExport?: () => Promise<string>; // Returns file path

  constructor(ownerNumber: string) {
    this.ownerNumber = ownerNumber;
    this.signal = createSignalService(ownerNumber);
    this.bridge = new HmanSignalBridge(this.signal, ownerNumber);

    // Listen for incoming commands
    this.signal.on('message', (msg) => this.handleMessage(msg));
    this.signal.on('error', (err) => this.handleError(err));
    this.signal.on('connected', () => this.handleConnected());
    this.signal.on('disconnected', () => this.handleDisconnected());
  }

  /**
   * Initialize and start listening
   */
  async start(): Promise<void> {
    console.log('[HMAN] Starting Signal interface...');
    
    const status = await this.signal.checkInstallation();
    if (!status.installed) {
      throw new Error('signal-cli is not installed');
    }
    if (!status.registered) {
      throw new Error('Signal account is not registered');
    }

    await this.signal.startDaemon();
    await this.sendMessage('🟢 HMAN is online\n\nReply HELP for commands');
  }

  /**
   * Stop the interface
   */
  async stop(): Promise<void> {
    await this.sendMessage('🔴 HMAN is going offline');
    await this.signal.stopDaemon();
  }

  /**
   * Handle incoming Signal message
   */
  private async handleMessage(msg: SignalMessage): Promise<void> {
    // Only respond to owner
    if (msg.sender !== this.ownerNumber) {
      console.log(`[HMAN] Ignoring message from non-owner: ${msg.sender}`);
      return;
    }

    const parsed = this.parseCommand(msg.body);
    await this.executeCommand(parsed);
  }

  /**
   * Parse text message into command
   */
  private parseCommand(text: string): ParsedCommand {
    const raw = text.trim();
    const parts = raw.split(/\s+/);
    const commandWord = (parts[0] || '').toUpperCase();
    const args = parts.slice(1);

    // Map text to command
    const commandMap: Record<string, HmanCommand> = {
      'STATUS': 'STATUS',
      'S': 'STATUS',
      'VAULTS': 'VAULTS',
      'V': 'VAULTS',
      'VAULT': 'VAULT',
      'PENDING': 'PENDING',
      'P': 'PENDING',
      'APPROVE': 'APPROVE',
      'A': 'APPROVE',
      'YES': 'APPROVE',
      'Y': 'APPROVE',
      'OK': 'APPROVE',
      'DENY': 'DENY',
      'D': 'DENY',
      'NO': 'DENY',
      'N': 'DENY',
      'REJECT': 'DENY',
      'HISTORY': 'HISTORY',
      'H': 'HISTORY',
      'HELP': 'HELP',
      '?': 'HELP',
      'LOCK': 'LOCK',
      'L': 'LOCK',
      'UNLOCK': 'UNLOCK',
      'U': 'UNLOCK',
      'EXPORT': 'EXPORT',
      'E': 'EXPORT',
      'DELEGATE': 'DELEGATE',
      'REVOKE': 'REVOKE',
      'AUDIT': 'AUDIT',
      'SETTINGS': 'SETTINGS',
    };

    const command = commandMap[commandWord] || 'UNKNOWN';

    return { command, args, raw };
  }

  /**
   * Execute parsed command
   */
  private async executeCommand(parsed: ParsedCommand): Promise<void> {
    try {
      switch (parsed.command) {
        case 'STATUS':
          await this.handleStatus();
          break;
        case 'VAULTS':
          await this.handleVaults();
          break;
        case 'PENDING':
          await this.handlePending();
          break;
        case 'APPROVE':
          await this.handleApprove(parsed.args);
          break;
        case 'DENY':
          await this.handleDeny(parsed.args);
          break;
        case 'HISTORY':
          await this.handleHistory(parsed.args);
          break;
        case 'HELP':
          await this.handleHelp();
          break;
        case 'LOCK':
          await this.handleLock();
          break;
        case 'UNLOCK':
          await this.handleUnlock(parsed.args);
          break;
        case 'EXPORT':
          await this.handleExport();
          break;
        case 'UNKNOWN':
          await this.handleUnknown(parsed.raw);
          break;
        default:
          await this.sendMessage(`⚠️ Command "${parsed.command}" not yet implemented`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      await this.sendMessage(`❌ Error: ${msg}`);
    }
  }

  // ========== Command Handlers ==========

  private async handleStatus(): Promise<void> {
    const status = this.onStatusRequest
      ? await this.onStatusRequest()
      : this.getDefaultStatus();

    const statusEmoji = status.signalConnected ? '🟢' : '🔴';
    const lockStatus = status.unlockedCount > 0 
      ? `🔓 ${status.unlockedCount} unlocked` 
      : '🔒 All locked';

    await this.sendMessage(
`📊 HMAN Status

${statusEmoji} Signal: ${status.signalConnected ? 'Connected' : 'Disconnected'}
${lockStatus}

📁 Vaults: ${status.vaultsCount}
⏳ Pending: ${status.pendingRequests}
👥 Delegations: ${status.delegations}
${status.lastActivity ? `\n🕐 Last: ${status.lastActivity}` : ''}`
    );
  }

  private async handleVaults(): Promise<void> {
    const vaults = this.onVaultsRequest
      ? await this.onVaultsRequest()
      : this.getDefaultVaults();

    if (vaults.length === 0) {
      await this.sendMessage('📁 No vaults found');
      return;
    }

    const vaultLines = vaults.map(v => {
      const lockIcon = v.locked ? '🔒' : '🔓';
      const levelIcon = this.getLevelIcon(v.permissionLevel);
      return `${lockIcon} ${v.name} (${v.itemCount}) ${levelIcon}`;
    });

    await this.sendMessage(
`📁 Your Vaults

${vaultLines.join('\n')}

Legend: 🟢Open 🟡Standard 🟠Gated 🔴Locked`
    );
  }

  private async handlePending(): Promise<void> {
    const pending = this.onPendingRequest
      ? await this.onPendingRequest()
      : this.getDefaultPending();

    if (pending.length === 0) {
      await this.sendMessage('✅ No pending requests');
      return;
    }

    const lines = pending.map((p, i) => {
      const id = String.fromCharCode(65 + i); // A, B, C...
      const typeIcon = p.requesterType === 'ai_model' ? '🤖' : 
                       p.requesterType === 'human' ? '👤' : '🔌';
      return `${id}. ${typeIcon} ${p.requester}\n   📂 ${p.resource}\n   📝 ${p.purpose}`;
    });

    await this.sendMessage(
`⏳ Pending Requests (${pending.length})

${lines.join('\n\n')}

Reply: A to approve first, D A to deny first
Or: APPROVE A, DENY B`
    );
  }

  private async handleApprove(args: string[]): Promise<void> {
    const requestId = args[0] || 'A';
    const duration = this.parseDuration(args[1]);

    if (this.onApprove) {
      const success = await this.onApprove(requestId, duration);
      if (success) {
        const durationText = duration ? ` for ${this.formatDuration(duration)}` : '';
        await this.sendMessage(`✅ Request ${requestId} approved${durationText}`);
      } else {
        await this.sendMessage(`❌ Failed to approve request ${requestId}`);
      }
    } else {
      await this.sendMessage(`✅ Request ${requestId} approved (demo mode)`);
    }
  }

  private async handleDeny(args: string[]): Promise<void> {
    const requestId = args[0] || 'A';
    const reason = args.slice(1).join(' ') || undefined;

    if (this.onDeny) {
      const success = await this.onDeny(requestId, reason);
      if (success) {
        await this.sendMessage(`🚫 Request ${requestId} denied`);
      } else {
        await this.sendMessage(`❌ Failed to deny request ${requestId}`);
      }
    } else {
      await this.sendMessage(`🚫 Request ${requestId} denied (demo mode)`);
    }
  }

  private async handleHistory(args: string[]): Promise<void> {
    const limit = parseInt(args[0] || '5', 10);
    
    const history = this.onHistoryRequest
      ? await this.onHistoryRequest(limit)
      : this.getDefaultHistory();

    if (history.length === 0) {
      await this.sendMessage('📜 No recent activity');
      return;
    }

    const lines = history.slice(0, limit).map(h => {
      const icon = h.outcome === 'success' ? '✅' : 
                   h.outcome === 'denied' ? '🚫' : '❌';
      const time = this.formatRelativeTime(h.timestamp);
      return `${icon} ${h.action} by ${h.actor}\n   ${time}`;
    });

    await this.sendMessage(
`📜 Recent Activity

${lines.join('\n\n')}`
    );
  }

  private async handleHelp(): Promise<void> {
    await this.sendMessage(
`📖 HMAN Commands

📊 STATUS (S) - System status
📁 VAULTS (V) - List vaults
⏳ PENDING (P) - Pending requests

✅ APPROVE [id] - Approve request
   • A, YES, OK, Y also work
   • APPROVE A 1h - approve for 1 hour
   
🚫 DENY [id] - Deny request
   • D, NO, N also work
   • DENY A privacy - deny with reason

📜 HISTORY (H) - Recent activity
🔒 LOCK (L) - Lock all vaults
📤 EXPORT (E) - Export .hman file

Reply with any command to get started!`
    );
  }

  private async handleLock(): Promise<void> {
    if (this.onLock) {
      await this.onLock();
    }
    await this.sendMessage('🔒 All vaults locked\n\nYour data is secured.');
  }

  private async handleUnlock(args: string[]): Promise<void> {
    const passphrase = args.join(' ');
    
    if (!passphrase) {
      await this.sendMessage('⚠️ Passphrase required\n\nUsage: UNLOCK your-passphrase');
      return;
    }

    if (this.onUnlock) {
      const success = await this.onUnlock(passphrase);
      if (success) {
        await this.sendMessage('🔓 Vaults unlocked');
      } else {
        await this.sendMessage('❌ Invalid passphrase');
      }
    } else {
      await this.sendMessage('🔓 Vaults unlocked (demo mode)');
    }
  }

  private async handleExport(): Promise<void> {
    if (this.onExport) {
      const filePath = await this.onExport();
      await this.signal.sendHmanFile(this.ownerNumber, filePath, '📁 Your HMAN export file');
    } else {
      await this.sendMessage('📤 Export created (demo mode)\n\nIn production, the .hman file would be sent as an attachment.');
    }
  }

  private async handleUnknown(raw: string): Promise<void> {
    // Check if it's a simple response to the most recent request
    const upper = raw.toUpperCase().trim();
    
    if (['Y', 'YES', 'OK', 'APPROVE'].includes(upper)) {
      await this.handleApprove([]);
      return;
    }
    
    if (['N', 'NO', 'DENY', 'REJECT'].includes(upper)) {
      await this.handleDeny([]);
      return;
    }

    await this.sendMessage(
`❓ Unknown command: "${raw}"

Reply HELP for available commands`
    );
  }

  // ========== Utility Methods ==========

  private getLevelIcon(level: PermissionLevel): string {
    const icons: Record<PermissionLevel, string> = {
      0: '🟢',  // Open
      1: '🟡',  // Standard
      2: '🟠',  // Gated
      3: '🔴',  // Locked
    };
    return icons[level] || '⚪';
  }

  private parseDuration(text?: string): number | undefined {
    if (!text) return undefined;
    
    const match = text.match(/^(\d+)([mhd])$/i);
    if (!match) return undefined;
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    
    switch (unit) {
      case 'm': return value * 60 * 1000;         // minutes
      case 'h': return value * 60 * 60 * 1000;    // hours
      case 'd': return value * 24 * 60 * 60 * 1000; // days
      default: return undefined;
    }
  }

  private formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  private async sendMessage(text: string): Promise<void> {
    await this.signal.sendMessage(this.ownerNumber, text);
  }

  // ========== Event Handlers ==========

  private handleError(error: Error): void {
    console.error('[HMAN] Signal error:', error.message);
  }

  private handleConnected(): void {
    console.log('[HMAN] Signal daemon connected');
  }

  private handleDisconnected(): void {
    console.log('[HMAN] Signal daemon disconnected');
  }

  // ========== Default Data (Demo Mode) ==========

  private getDefaultStatus(): HmanStatus {
    return {
      vaultsCount: 6,
      unlockedCount: 2,
      pendingRequests: 2,
      delegations: 3,
      lastActivity: '5 minutes ago',
      signalConnected: true,
    };
  }

  private getDefaultVaults(): VaultSummary[] {
    return [
      { id: '1', name: 'Identity', type: 'identity' as VaultType, itemCount: 8, locked: false, permissionLevel: 0 },
      { id: '2', name: 'Finance', type: 'finance' as VaultType, itemCount: 23, locked: true, permissionLevel: 2 },
      { id: '3', name: 'Health', type: 'health' as VaultType, itemCount: 12, locked: true, permissionLevel: 2 },
      { id: '4', name: 'Calendar', type: 'calendar' as VaultType, itemCount: 45, locked: false, permissionLevel: 1 },
      { id: '5', name: 'Secrets', type: 'secrets' as VaultType, itemCount: 5, locked: true, permissionLevel: 3 },
      { id: '6', name: 'Diary', type: 'diary' as VaultType, itemCount: 156, locked: true, permissionLevel: 1 },
    ];
  }

  private getDefaultPending(): PendingRequest[] {
    return [
      {
        id: 'req-1',
        shortId: 'A',
        requester: 'Claude',
        requesterType: 'ai_model',
        resource: 'Finance / Budget Analysis',
        purpose: 'Analyze spending patterns for budget recommendations',
        timestamp: new Date(Date.now() - 5 * 60000),
      },
      {
        id: 'req-2',
        shortId: 'B',
        requester: 'Energy Australia Bot',
        requesterType: 'service',
        resource: 'Identity / Address',
        purpose: 'Update billing address',
        timestamp: new Date(Date.now() - 15 * 60000),
      },
    ];
  }

  private getDefaultHistory(): ActivityEntry[] {
    return [
      { timestamp: new Date(Date.now() - 5 * 60000), action: 'Access Granted', actor: 'Claude', resource: 'Calendar', outcome: 'success' },
      { timestamp: new Date(Date.now() - 1 * 3600000), action: 'Access Denied', actor: 'GPT-4', resource: 'Health', outcome: 'denied' },
      { timestamp: new Date(Date.now() - 2 * 3600000), action: 'Vault Unlocked', actor: 'You', resource: 'Calendar', outcome: 'success' },
      { timestamp: new Date(Date.now() - 3 * 3600000), action: 'Export Created', actor: 'You', resource: 'Identity', outcome: 'success' },
      { timestamp: new Date(Date.now() - 24 * 3600000), action: 'Delegation Added', actor: 'You', resource: 'Emergency Contact', outcome: 'success' },
    ];
  }

  // ========== SDK Integration ==========

  /**
   * Set callback for status requests
   */
  setOnStatus(handler: () => Promise<HmanStatus>): void {
    this.onStatusRequest = handler;
  }

  /**
   * Set callback for vaults list
   */
  setOnVaults(handler: () => Promise<VaultSummary[]>): void {
    this.onVaultsRequest = handler;
  }

  /**
   * Set callback for pending requests
   */
  setOnPending(handler: () => Promise<PendingRequest[]>): void {
    this.onPendingRequest = handler;
  }

  /**
   * Set callback for approve action
   */
  setOnApprove(handler: (requestId: string, duration?: number) => Promise<boolean>): void {
    this.onApprove = handler;
  }

  /**
   * Set callback for deny action
   */
  setOnDeny(handler: (requestId: string, reason?: string) => Promise<boolean>): void {
    this.onDeny = handler;
  }

  /**
   * Set callback for history requests
   */
  setOnHistory(handler: (limit?: number) => Promise<ActivityEntry[]>): void {
    this.onHistoryRequest = handler;
  }

  /**
   * Set callback for lock action
   */
  setOnLock(handler: () => Promise<void>): void {
    this.onLock = handler;
  }

  /**
   * Set callback for unlock action
   */
  setOnUnlock(handler: (passphrase: string) => Promise<boolean>): void {
    this.onUnlock = handler;
  }

  /**
   * Set callback for export action
   */
  setOnExport(handler: () => Promise<string>): void {
    this.onExport = handler;
  }

  /**
   * Send a proactive access request notification
   */
  async notifyAccessRequest(request: PendingRequest): Promise<void> {
    const typeIcon = request.requesterType === 'ai_model' ? '🤖' : 
                     request.requesterType === 'human' ? '👤' : '🔌';
    
    await this.sendMessage(
`🔐 Access Request

${typeIcon} ${request.requester}
📂 ${request.resource}
📝 ${request.purpose}

Reply: A to approve, D to deny
Or: A 1h to approve for 1 hour`
    );
  }

  /**
   * Send a proactive notification
   */
  async notify(message: string): Promise<void> {
    await this.sendMessage(message);
  }
}

/**
 * Create and start a Signal interface
 */
export async function createSignalInterface(phoneNumber: string): Promise<HmanSignalInterface> {
  const iface = new HmanSignalInterface(phoneNumber);
  await iface.start();
  return iface;
}
