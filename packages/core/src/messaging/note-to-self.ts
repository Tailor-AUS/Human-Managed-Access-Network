/**
 * HMAN Note-to-Self Profile Manager
 * 
 * Uses Signal's "Note to Self" conversation as the data store.
 * Your profile lives in your Signal messages - E2E encrypted and synced.
 * 
 * How it works:
 * 1. Profile data is stored as structured messages in your Note to Self
 * 2. Each vault is represented as a message thread/section
 * 3. The .hman file is sent as an attachment for backup
 * 4. Commands update/query the stored messages
 * 
 * Message Format:
 * - Profile Header: Pinned message with core identity
 * - Vault Sections: Messages prefixed with [VAULT:name]
 * - Items: Individual messages with structured format
 * - Backup: .hman file attachment
 */

import { SignalService, SignalMessage, createSignalService } from './signal.js';
import { PermissionLevel, VaultType } from '@hman/shared';

// Message prefixes for parsing
const PREFIXES = {
    PROFILE: '📋 HMAN PROFILE',
    VAULT: '📁 VAULT:',
    ITEM: '📎 ITEM:',
    BACKUP: '💾 BACKUP:',
    ACCESS_LOG: '📜 ACCESS:',
    DELEGATION: '👥 DELEGATE:',
} as const;

// Profile stored in Note to Self
export interface NoteToSelfProfile {
    // Core identity (from first message)
    displayName: string;
    signal: string;
    email?: string;
    timezone?: string;
    location?: string;
    language?: string;
    tags: string[];

    // Metadata
    createdAt: string;
    updatedAt: string;
    version: string;
}

// Vault item stored as individual message
export interface NoteToSelfItem {
    messageId?: string;  // Signal message ID for updates
    id: string;
    vault: VaultType;
    type: string;
    label: string;
    data: string;  // Serialized JSON
    permissionLevel: PermissionLevel;
    createdAt: string;
}

// Access log entry
export interface AccessLogEntry {
    timestamp: string;
    requester: string;
    requesterType: 'ai_model' | 'human' | 'service';
    resource: string;
    action: 'approved' | 'denied' | 'auto_approved';
    duration?: string;
    reason?: string;
}

/**
 * Note-to-Self Profile Manager
 * 
 * Your HMAN profile lives in Signal!
 */
export class NoteToSelfManager {
    private signal: SignalService;
    private phoneNumber: string;

    // Cached data from Note to Self
    private profile: NoteToSelfProfile | null = null;
    private items: NoteToSelfItem[] = [];
    private accessLog: AccessLogEntry[] = [];

    constructor(phoneNumber: string) {
        this.phoneNumber = phoneNumber;
        this.signal = createSignalService(phoneNumber);
    }

    /**
     * Initialize and sync with Note to Self
     */
    async start(): Promise<void> {
        console.log('[HMAN] Starting Note-to-Self Manager...');

        const status = await this.signal.checkInstallation();
        if (!status.installed || !status.registered) {
            throw new Error('Signal not configured');
        }

        // Load existing data from Note to Self
        await this.syncFromNoteToSelf();

        // Listen for new messages
        this.signal.on('message', (msg) => this.handleMessage(msg));
        await this.signal.startDaemon();

        // Send ready message
        if (!this.profile) {
            await this.initializeProfile();
        } else {
            await this.send(`🟢 HMAN Ready\n\nProfile: ${this.profile.displayName}\n${this.items.length} items synced`);
        }
    }

    /**
     * Sync data from Note to Self messages
     */
    private async syncFromNoteToSelf(): Promise<void> {
        console.log('[HMAN] Syncing from Note to Self...');

        // Receive all messages
        const messages = await this.signal.receiveMessages();

        for (const msg of messages) {
            // Only process our own messages (Note to Self)
            if (msg.sender === this.phoneNumber) {
                this.parseStoredMessage(msg);
            }
        }

        console.log(`[HMAN] Synced: Profile=${!!this.profile}, Items=${this.items.length}`);
    }

    /**
     * Parse a stored message from Note to Self
     */
    private parseStoredMessage(msg: SignalMessage): void {
        const body = msg.body;

        // Profile header
        if (body.startsWith(PREFIXES.PROFILE)) {
            this.profile = this.parseProfileMessage(body);
        }
        // Vault item
        else if (body.startsWith(PREFIXES.ITEM)) {
            const item = this.parseItemMessage(body, msg.id);
            if (item) {
                this.items.push(item);
            }
        }
        // Access log
        else if (body.startsWith(PREFIXES.ACCESS_LOG)) {
            const entry = this.parseAccessLogMessage(body);
            if (entry) {
                this.accessLog.push(entry);
            }
        }
    }

    // ========== Profile Management ==========

    /**
     * Initialize a new profile in Note to Self
     */
    private async initializeProfile(): Promise<void> {
        this.profile = {
            displayName: 'HMAN User',
            signal: this.phoneNumber,
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: '1.0',
        };

        await this.saveProfile();

        await this.send(
            `🎉 Welcome to HMAN!

Your profile has been created in Note to Self.
All your data is E2E encrypted by Signal.

Quick start:
• SET NAME Your Name
• SET EMAIL your@email.com
• ADD NOTE My first note
• PROFILE - view your profile
• HELP - all commands`
        );
    }

    /**
     * Save profile to Note to Self
     */
    private async saveProfile(): Promise<void> {
        if (!this.profile) return;

        this.profile.updatedAt = new Date().toISOString();

        const message = this.formatProfileMessage(this.profile);
        await this.send(message);
    }

    /**
     * Format profile as storable message
     */
    private formatProfileMessage(profile: NoteToSelfProfile): string {
        return `${PREFIXES.PROFILE}
━━━━━━━━━━━━━━━━━━━━━━━
👤 ${profile.displayName}
📱 ${profile.signal}
${profile.email ? `📧 ${profile.email}` : ''}
${profile.timezone ? `🌏 ${profile.timezone}` : ''}
${profile.location ? `📍 ${profile.location}` : ''}
${profile.tags.length > 0 ? `🏷️ ${profile.tags.map(t => '#' + t).join(' ')}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━
📅 Created: ${profile.createdAt.split('T')[0]}
🔄 Updated: ${profile.updatedAt.split('T')[0]}
🔢 Version: ${profile.version}`;
    }

    /**
     * Parse profile from message
     */
    private parseProfileMessage(body: string): NoteToSelfProfile {
        const lines = body.split('\n');

        let displayName = 'HMAN User';
        let signal = this.phoneNumber;
        let email: string | undefined;
        let timezone: string | undefined;
        let location: string | undefined;
        const tags: string[] = [];
        let createdAt = new Date().toISOString();
        let updatedAt = new Date().toISOString();

        for (const line of lines) {
            if (line.startsWith('👤 ')) displayName = line.substring(2).trim();
            if (line.startsWith('📱 ')) signal = line.substring(2).trim();
            if (line.startsWith('📧 ')) email = line.substring(2).trim();
            if (line.startsWith('🌏 ')) timezone = line.substring(2).trim();
            if (line.startsWith('📍 ')) location = line.substring(2).trim();
            if (line.startsWith('🏷️ ')) {
                const tagsPart = line.substring(2).trim();
                const matches = tagsPart.match(/#\w+/g);
                if (matches) {
                    tags.push(...matches.map(t => t.substring(1)));
                }
            }
            if (line.startsWith('📅 Created: ')) {
                createdAt = line.substring(12).trim();
            }
            if (line.startsWith('🔄 Updated: ')) {
                updatedAt = line.substring(12).trim();
            }
        }

        return {
            displayName,
            signal,
            email,
            timezone,
            location,
            language: undefined,
            tags,
            createdAt,
            updatedAt,
            version: '1.0',
        };
    }

    // ========== Item Management ==========

    /**
     * Add item to vault (saved as message)
     */
    async addItem(
        vault: VaultType,
        type: string,
        label: string,
        data: Record<string, unknown>,
        permissionLevel: PermissionLevel = PermissionLevel.Standard
    ): Promise<NoteToSelfItem> {
        const item: NoteToSelfItem = {
            id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            vault,
            type,
            label,
            data: JSON.stringify(data),
            permissionLevel,
            createdAt: new Date().toISOString(),
        };

        // Save to Note to Self
        const message = this.formatItemMessage(item);
        await this.send(message);

        this.items.push(item);
        return item;
    }

    /**
     * Format item as storable message
     */
    private formatItemMessage(item: NoteToSelfItem): string {
        const levelIcon = this.getLevelIcon(item.permissionLevel);

        return `${PREFIXES.ITEM} ${item.vault.toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━━━
🏷️ ${item.label}
📦 Type: ${item.type}
${levelIcon} Level: ${PermissionLevel[item.permissionLevel]}
📅 ${item.createdAt.split('T')[0]}
━━━━━━━━━━━━━━━━━━━━━━━
${item.data}
━━━━━━━━━━━━━━━━━━━━━━━
🔑 ID: ${item.id}`;
    }

    /**
     * Parse item from message
     */
    private parseItemMessage(body: string, messageId?: string): NoteToSelfItem | null {
        try {
            const lines = body.split('\n');
            const headerLine = lines[0];

            // Extract vault from header
            const vaultMatch = headerLine.match(/ITEM:\s*(\w+)/);
            if (!vaultMatch) return null;

            const vault = vaultMatch[1].toLowerCase() as VaultType;

            let label = '';
            let type = 'note';
            let permissionLevel = PermissionLevel.Standard;
            let createdAt = new Date().toISOString();
            let id = '';
            let dataStart = -1;
            let dataEnd = -1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.startsWith('🏷️ ')) label = line.substring(2).trim();
                if (line.startsWith('📦 Type: ')) type = line.substring(9).trim();
                if (line.startsWith('📅 ')) createdAt = line.substring(2).trim();
                if (line.startsWith('🔑 ID: ')) id = line.substring(7).trim();
                if (line === '━━━━━━━━━━━━━━━━━━━━━━━') {
                    if (dataStart === -1) dataStart = i + 1;
                    else if (dataEnd === -1) dataEnd = i;
                }
                if (line.includes('🟢')) permissionLevel = PermissionLevel.Open;
                if (line.includes('🟡')) permissionLevel = PermissionLevel.Standard;
                if (line.includes('🟠')) permissionLevel = PermissionLevel.Gated;
                if (line.includes('🔴')) permissionLevel = PermissionLevel.Locked;
            }

            let data = '{}';
            if (dataStart > 0 && dataEnd > dataStart) {
                data = lines.slice(dataStart, dataEnd).join('\n');
            }

            return {
                messageId,
                id: id || `item-${Date.now()}`,
                vault,
                type,
                label,
                data,
                permissionLevel,
                createdAt,
            };
        } catch {
            return null;
        }
    }

    // ========== Access Logging ==========

    /**
     * Log an access event to Note to Self
     */
    async logAccess(entry: AccessLogEntry): Promise<void> {
        const message = this.formatAccessLogMessage(entry);
        await this.send(message);
        this.accessLog.push(entry);
    }

    private formatAccessLogMessage(entry: AccessLogEntry): string {
        const actionIcon = entry.action === 'approved' ? '✅' :
            entry.action === 'denied' ? '🚫' : '⚡';

        return `${PREFIXES.ACCESS_LOG} ${entry.timestamp}
${actionIcon} ${entry.action.toUpperCase()}
🤖 ${entry.requester} (${entry.requesterType})
📂 ${entry.resource}
${entry.duration ? `⏱️ Duration: ${entry.duration}` : ''}
${entry.reason ? `💬 Reason: ${entry.reason}` : ''}`;
    }

    private parseAccessLogMessage(body: string): AccessLogEntry | null {
        try {
            const lines = body.split('\n');
            const timestampMatch = lines[0].match(/ACCESS:\s*(.+)/);

            if (!timestampMatch) return null;

            let action: AccessLogEntry['action'] = 'approved';
            let requester = 'Unknown';
            let requesterType: AccessLogEntry['requesterType'] = 'ai_model';
            let resource = '';
            let duration: string | undefined;
            let reason: string | undefined;

            for (const line of lines) {
                if (line.includes('APPROVED')) action = 'approved';
                if (line.includes('DENIED')) action = 'denied';
                if (line.includes('AUTO_APPROVED')) action = 'auto_approved';
                if (line.startsWith('🤖 ')) {
                    const match = line.match(/🤖\s*(.+)\s*\((\w+)\)/);
                    if (match) {
                        requester = match[1].trim();
                        requesterType = match[2] as AccessLogEntry['requesterType'];
                    }
                }
                if (line.startsWith('📂 ')) resource = line.substring(2).trim();
                if (line.startsWith('⏱️ Duration: ')) duration = line.substring(13).trim();
                if (line.startsWith('💬 Reason: ')) reason = line.substring(11).trim();
            }

            return {
                timestamp: timestampMatch[1],
                requester,
                requesterType,
                resource,
                action,
                duration,
                reason,
            };
        } catch {
            return null;
        }
    }

    // ========== Command Handler ==========

    private async handleMessage(msg: SignalMessage): Promise<void> {
        // Only respond to messages from self (Note to Self commands)
        if (msg.sender !== this.phoneNumber) return;

        // Ignore our own stored data messages
        const body = msg.body;
        if (body.startsWith(PREFIXES.PROFILE) ||
            body.startsWith(PREFIXES.ITEM) ||
            body.startsWith(PREFIXES.ACCESS_LOG) ||
            body.startsWith(PREFIXES.BACKUP)) {
            return;
        }

        await this.processCommand(body);
    }

    private async processCommand(text: string): Promise<void> {
        const upper = text.toUpperCase().trim();
        const parts = text.trim().split(/\s+/);
        const command = (parts[0] || '').toUpperCase();

        try {
            // Profile
            if (command === 'PROFILE' || command === 'P') {
                await this.showProfile();
            }
            // Set commands
            else if (upper.startsWith('SET ')) {
                await this.handleSet(text.substring(4));
            }
            // Add commands
            else if (upper.startsWith('ADD ')) {
                await this.handleAdd(text.substring(4));
            }
            // List
            else if (command === 'LIST' || command === 'L') {
                await this.listItems(parts[1]);
            }
            // Export
            else if (command === 'EXPORT' || command === 'E') {
                await this.exportProfile();
            }
            // Status
            else if (command === 'STATUS' || command === 'S') {
                await this.showStatus();
            }
            // Help
            else if (command === 'HELP' || command === '?') {
                await this.showHelp();
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            await this.send(`❌ Error: ${msg}`);
        }
    }

    // ========== Command Implementations ==========

    private async handleSet(args: string): Promise<void> {
        if (!this.profile) {
            await this.initializeProfile();
            return;
        }

        const parts = args.split(/\s+/);
        const field = (parts[0] || '').toUpperCase();
        const value = parts.slice(1).join(' ');

        if (!value) {
            await this.send(`⚠️ Value required: SET ${field} <value>`);
            return;
        }

        switch (field) {
            case 'NAME':
                this.profile.displayName = value;
                break;
            case 'EMAIL':
                this.profile.email = value;
                break;
            case 'TIMEZONE':
            case 'TZ':
                this.profile.timezone = value;
                break;
            case 'LOCATION':
            case 'LOC':
                this.profile.location = value;
                break;
            default:
                await this.send(`⚠️ Unknown field: ${field}\n\nUse: NAME, EMAIL, TIMEZONE, LOCATION`);
                return;
        }

        await this.saveProfile();
        await this.send(`✅ Updated: ${field} = ${value}`);
    }

    private async handleAdd(args: string): Promise<void> {
        const parts = args.split(/\s+/);
        const type = (parts[0] || '').toUpperCase();
        const rest = args.substring(type.length).trim();

        switch (type) {
            case 'NOTE':
                const [title, ...content] = rest.split('|').map(s => s.trim());
                if (!title) {
                    await this.send(`⚠️ Usage: ADD NOTE <title> | <content>`);
                    return;
                }
                await this.addItem('diary' as VaultType, 'note', title, {
                    title,
                    content: content.join('|')
                });
                await this.send(`✅ Note added: "${title}"\n📁 Saved to Note to Self`);
                break;

            case 'CONTACT':
                const [name, phone, email] = rest.split('|').map(s => s.trim());
                if (!name) {
                    await this.send(`⚠️ Usage: ADD CONTACT <name> | <phone> | <email>`);
                    return;
                }
                await this.addItem('identity' as VaultType, 'contact', name, { name, phone, email });
                await this.send(`✅ Contact added: ${name}`);
                break;

            case 'TAG':
                if (!rest) {
                    await this.send(`⚠️ Usage: ADD TAG <tag>`);
                    return;
                }
                if (this.profile && !this.profile.tags.includes(rest)) {
                    this.profile.tags.push(rest);
                    await this.saveProfile();
                }
                await this.send(`✅ Tag added: #${rest}`);
                break;

            default:
                await this.send(`⚠️ Unknown type: ${type}\n\nUse: NOTE, CONTACT, TAG`);
        }
    }

    private async listItems(vaultFilter?: string): Promise<void> {
        let filtered = this.items;

        if (vaultFilter) {
            filtered = this.items.filter(i =>
                i.vault.toUpperCase() === vaultFilter.toUpperCase()
            );
        }

        if (filtered.length === 0) {
            await this.send(`📋 No items${vaultFilter ? ` in ${vaultFilter}` : ''}`);
            return;
        }

        const lines = filtered.slice(0, 10).map((item, i) =>
            `${i + 1}. ${item.label} [${item.vault}]`
        );

        await this.send(
            `📋 Items (${filtered.length})

${lines.join('\n')}${filtered.length > 10 ? `\n\n... and ${filtered.length - 10} more` : ''}`
        );
    }

    private async showProfile(): Promise<void> {
        if (!this.profile) {
            await this.send(`No profile yet. Use SET NAME to start.`);
            return;
        }

        await this.send(this.formatProfileMessage(this.profile));
    }

    private async showStatus(): Promise<void> {
        const vaultCounts: Record<string, number> = {};
        for (const item of this.items) {
            vaultCounts[item.vault] = (vaultCounts[item.vault] || 0) + 1;
        }

        await this.send(
            `📊 HMAN Status

🟢 Signal: Connected
👤 Profile: ${this.profile?.displayName || 'Not set'}

📁 Data in Note to Self:
${Object.entries(vaultCounts).map(([v, c]) => `• ${v}: ${c} items`).join('\n') || '(empty)'}

📜 Access Log: ${this.accessLog.length} entries`
        );
    }

    private async exportProfile(): Promise<void> {
        const exportData = {
            profile: this.profile,
            items: this.items,
            exportedAt: new Date().toISOString(),
        };

        await this.send(
            `💾 BACKUP: ${new Date().toISOString()}
━━━━━━━━━━━━━━━━━━━━━━━
${JSON.stringify(exportData, null, 2)}
━━━━━━━━━━━━━━━━━━━━━━━
📊 Profile + ${this.items.length} items`
        );
    }

    private async showHelp(): Promise<void> {
        await this.send(
            `📖 HMAN Note-to-Self Commands

Your data lives in Signal! 🔐

👤 Profile:
• PROFILE - View profile
• SET NAME <name>
• SET EMAIL <email>
• SET TIMEZONE <tz>
• ADD TAG <tag>

📁 Data:
• ADD NOTE <title> | <content>
• ADD CONTACT <name> | <phone> | <email>
• LIST [vault] - See items

📊 System:
• STATUS - Check status
• EXPORT - Backup data
• HELP - This message

All data is stored in Note to Self!`
        );
    }

    // ========== Utilities ==========

    private async send(text: string): Promise<void> {
        await this.signal.sendMessage(this.phoneNumber, text);
    }

    private getLevelIcon(level: PermissionLevel): string {
        const icons: Record<PermissionLevel, string> = {
            [PermissionLevel.Open]: '🟢',
            [PermissionLevel.Standard]: '🟡',
            [PermissionLevel.Gated]: '🟠',
            [PermissionLevel.Locked]: '🔴',
        };
        return icons[level] || '⚪';
    }

    // ========== Public API ==========

    getProfile(): NoteToSelfProfile | null {
        return this.profile;
    }

    getItems(vault?: VaultType): NoteToSelfItem[] {
        if (vault) {
            return this.items.filter(i => i.vault === vault);
        }
        return this.items;
    }

    getAccessLog(): AccessLogEntry[] {
        return this.accessLog;
    }
}

/**
 * Create and start the Note-to-Self manager
 */
export async function createNoteToSelfManager(phoneNumber: string): Promise<NoteToSelfManager> {
    const manager = new NoteToSelfManager(phoneNumber);
    await manager.start();
    return manager;
}
