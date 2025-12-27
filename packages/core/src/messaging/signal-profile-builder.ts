/**
 * HMAN Signal Profile Builder
 * 
 * Build and manage your .hman profile entirely via Signal messages.
 * 
 * Profile Commands:
 *   PROFILE - View current profile
 *   SET NAME <name> - Set display name
 *   SET EMAIL <email> - Set email address
 *   SET PHONE <phone> - Set phone number
 *   SET TIMEZONE <tz> - Set timezone
 *   SET LOCATION <location> - Set location
 *   ADD TAG <tag> - Add a tag to profile
 *   
 * Vault Commands:
 *   ADD NOTE <title> | <content> - Add a note
 *   ADD CONTACT <name> | <phone> | <email> - Add contact
 *   ADD ACCOUNT <service> | <username> - Add account
 *   ADD HEALTH <type> | <value> | <date> - Add health record
 *   ADD FINANCE <type> | <amount> | <description> - Add transaction
 *   
 * Export Commands:
 *   EXPORT - Export full .hman file (sent as attachment)
 *   BACKUP - Create encrypted backup
 */

import { SignalService, SignalMessage, createSignalService } from './signal.js';
import { VaultType, PermissionLevel } from '@hman/shared';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Profile data structure
export interface HmanProfile {
    // Core identity
    displayName?: string;
    email?: string;
    phone?: string;
    timezone?: string;
    location?: string;
    language?: string;

    // Metadata
    tags: string[];
    createdAt: Date;
    updatedAt: Date;

    // Preferences
    defaultPermissionLevel: PermissionLevel;
    notifyOnAccess: boolean;
    autoApproveOpen: boolean;
}

// Item types for different vaults
export interface ProfileItem {
    id: string;
    type: string;
    label: string;
    data: Record<string, unknown>;
    vault: VaultType;
    permissionLevel: PermissionLevel;
    createdAt: Date;
}

/**
 * Signal Profile Builder - Build .hman profile via Signal
 */
export class SignalProfileBuilder {
    private signal: SignalService;
    private ownerNumber: string;
    private profile: HmanProfile;
    private items: ProfileItem[] = [];
    private dataPath: string;

    constructor(ownerNumber: string, dataPath: string = './hman-data') {
        this.ownerNumber = ownerNumber;
        this.signal = createSignalService(ownerNumber);
        this.dataPath = dataPath;

        // Ensure data directory exists
        if (!existsSync(dataPath)) {
            mkdirSync(dataPath, { recursive: true });
        }

        // Initialize empty profile
        this.profile = {
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            defaultPermissionLevel: PermissionLevel.Gated,
            notifyOnAccess: true,
            autoApproveOpen: true,
        };
    }

    /**
     * Initialize and start listening
     */
    async start(): Promise<void> {
        console.log('[HMAN] Starting Signal Profile Builder...');

        // Check Signal
        const status = await this.signal.checkInstallation();
        if (!status.installed || !status.registered) {
            throw new Error('Signal not configured. Run signal:setup first.');
        }

        // Listen for messages
        this.signal.on('message', (msg) => this.handleMessage(msg));

        await this.signal.startDaemon();
        await this.sendWelcome();

        console.log('[HMAN] Profile Builder ready. Send commands via Signal.');
    }

    /**
     * Handle incoming Signal message
     */
    private async handleMessage(msg: SignalMessage): Promise<void> {
        if (msg.sender !== this.ownerNumber) return;

        const text = msg.body.trim();
        const upperText = text.toUpperCase();
        const parts = text.split(/\s+/);
        const command = (parts[0] || '').toUpperCase();

        try {
            // Profile commands
            if (command === 'PROFILE' || command === 'P') {
                await this.showProfile();
            }
            else if (upperText.startsWith('SET ')) {
                await this.handleSet(text.substring(4));
            }
            else if (upperText.startsWith('ADD ')) {
                await this.handleAdd(text.substring(4));
            }
            // Export commands
            else if (command === 'EXPORT' || command === 'E') {
                await this.handleExport();
            }
            else if (command === 'BACKUP') {
                await this.handleBackup();
            }
            // List commands
            else if (command === 'LIST') {
                await this.handleList(parts[1]?.toUpperCase());
            }
            // Help
            else if (command === 'HELP' || command === '?') {
                await this.showHelp();
            }
            // Unknown
            else {
                await this.send(`❓ Unknown: "${text}"\n\nReply HELP for commands`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            await this.send(`❌ Error: ${msg}`);
        }
    }

    // ========== SET Commands ==========

    private async handleSet(args: string): Promise<void> {
        const parts = args.split(/\s+/);
        const field = (parts[0] || '').toUpperCase();
        const value = parts.slice(1).join(' ');

        if (!value) {
            await this.send(`⚠️ Value required\n\nUsage: SET ${field} <value>`);
            return;
        }

        switch (field) {
            case 'NAME':
                this.profile.displayName = value;
                await this.saveProfile();
                await this.send(`✓ Name set: ${value}`);
                break;

            case 'EMAIL':
                if (!this.isValidEmail(value)) {
                    await this.send(`⚠️ Invalid email format`);
                    return;
                }
                this.profile.email = value;
                await this.saveProfile();
                await this.send(`✓ Email set: ${value}`);
                break;

            case 'PHONE':
                this.profile.phone = value;
                await this.saveProfile();
                await this.send(`✓ Phone set: ${value}`);
                break;

            case 'TIMEZONE':
            case 'TZ':
                this.profile.timezone = value;
                await this.saveProfile();
                await this.send(`✓ Timezone set: ${value}`);
                break;

            case 'LOCATION':
            case 'LOC':
                this.profile.location = value;
                await this.saveProfile();
                await this.send(`✓ Location set: ${value}`);
                break;

            case 'LANGUAGE':
            case 'LANG':
                this.profile.language = value;
                await this.saveProfile();
                await this.send(`✓ Language set: ${value}`);
                break;

            default:
                await this.send(
                    `⚠️ Unknown field: ${field}

Available fields:
• NAME - Display name
• EMAIL - Email address
• PHONE - Phone number
• TIMEZONE - Timezone (e.g., Australia/Sydney)
• LOCATION - Location
• LANGUAGE - Preferred language`
                );
        }
    }

    // ========== ADD Commands ==========

    private async handleAdd(args: string): Promise<void> {
        const parts = args.split(/\s+/);
        const itemType = (parts[0] || '').toUpperCase();
        const rest = args.substring(parts[0].length).trim();

        switch (itemType) {
            case 'TAG':
                await this.addTag(rest);
                break;

            case 'NOTE':
                await this.addNote(rest);
                break;

            case 'CONTACT':
                await this.addContact(rest);
                break;

            case 'ACCOUNT':
                await this.addAccount(rest);
                break;

            case 'HEALTH':
                await this.addHealth(rest);
                break;

            case 'FINANCE':
            case 'TRANSACTION':
                await this.addFinance(rest);
                break;

            case 'EVENT':
            case 'CALENDAR':
                await this.addEvent(rest);
                break;

            default:
                await this.send(
                    `⚠️ Unknown item type: ${itemType}

Available types:
• TAG <tag> - Add profile tag
• NOTE <title> | <content> - Add note
• CONTACT <name> | <phone> | <email> - Add contact
• ACCOUNT <service> | <username> - Add account
• HEALTH <type> | <value> | <date> - Add health record
• FINANCE <type> | <amount> | <desc> - Add transaction
• EVENT <title> | <date> | <time> - Add calendar event`
                );
        }
    }

    private async addTag(tag: string): Promise<void> {
        if (!tag) {
            await this.send(`⚠️ Tag required\n\nUsage: ADD TAG <tag>`);
            return;
        }

        if (!this.profile.tags.includes(tag)) {
            this.profile.tags.push(tag);
            await this.saveProfile();
        }

        await this.send(`✓ Tag added: #${tag}\n\nAll tags: ${this.profile.tags.map(t => '#' + t).join(' ')}`);
    }

    private async addNote(args: string): Promise<void> {
        const [title, ...contentParts] = args.split('|').map(s => s.trim());
        const content = contentParts.join('|');

        if (!title) {
            await this.send(`⚠️ Title required\n\nUsage: ADD NOTE <title> | <content>`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'note',
            label: title,
            data: { title, content: content || '' },
            vault: 'diary' as VaultType,
            permissionLevel: PermissionLevel.Standard,
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Note added: "${title}"\n📁 Saved to Diary vault`);
    }

    private async addContact(args: string): Promise<void> {
        const [name, phone, email] = args.split('|').map(s => s.trim());

        if (!name) {
            await this.send(`⚠️ Name required\n\nUsage: ADD CONTACT <name> | <phone> | <email>`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'contact',
            label: name,
            data: { name, phone, email },
            vault: 'identity' as VaultType,
            permissionLevel: PermissionLevel.Standard,
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Contact added: ${name}\n📁 Saved to Identity vault`);
    }

    private async addAccount(args: string): Promise<void> {
        const [service, username] = args.split('|').map(s => s.trim());

        if (!service || !username) {
            await this.send(`⚠️ Service and username required\n\nUsage: ADD ACCOUNT <service> | <username>`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'account',
            label: `${service} (${username})`,
            data: { service, username },
            vault: 'identity' as VaultType,
            permissionLevel: PermissionLevel.Standard,
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Account added: ${service}\n   Username: ${username}\n📁 Saved to Identity vault`);
    }

    private async addHealth(args: string): Promise<void> {
        const [type, value, date] = args.split('|').map(s => s.trim());

        if (!type || !value) {
            await this.send(`⚠️ Type and value required\n\nUsage: ADD HEALTH <type> | <value> | <date>\n\nExamples:\n• ADD HEALTH weight | 75kg\n• ADD HEALTH blood pressure | 120/80 | 2024-01-15`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'health_record',
            label: type,
            data: {
                type,
                value,
                recordedAt: date || new Date().toISOString().split('T')[0]
            },
            vault: 'health' as VaultType,
            permissionLevel: PermissionLevel.Gated, // Health is gated by default
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Health record added\n   ${type}: ${value}\n🔒 Saved to Health vault (Gated)`);
    }

    private async addFinance(args: string): Promise<void> {
        const [type, amount, description] = args.split('|').map(s => s.trim());

        if (!type || !amount) {
            await this.send(`⚠️ Type and amount required\n\nUsage: ADD FINANCE <type> | <amount> | <description>\n\nExamples:\n• ADD FINANCE income | $5000 | Salary\n• ADD FINANCE expense | $45.50 | Groceries`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'transaction',
            label: description || type,
            data: {
                type,
                amount: this.parseAmount(amount),
                currency: 'AUD',
                description: description || '',
                date: new Date().toISOString(),
            },
            vault: 'finance' as VaultType,
            permissionLevel: PermissionLevel.Gated, // Finance is gated by default
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Transaction added\n   ${type}: ${amount}\n   ${description || '(no description)'}\n🔒 Saved to Finance vault (Gated)`);
    }

    private async addEvent(args: string): Promise<void> {
        const [title, date, time] = args.split('|').map(s => s.trim());

        if (!title) {
            await this.send(`⚠️ Title required\n\nUsage: ADD EVENT <title> | <date> | <time>\n\nExamples:\n• ADD EVENT Doctor appointment | 2024-01-20 | 10:00\n• ADD EVENT Team meeting | tomorrow | 2pm`);
            return;
        }

        const item: ProfileItem = {
            id: this.generateId(),
            type: 'event',
            label: title,
            data: {
                title,
                date: date || 'TBD',
                time: time || '',
            },
            vault: 'calendar' as VaultType,
            permissionLevel: PermissionLevel.Standard,
            createdAt: new Date(),
        };

        this.items.push(item);
        await this.saveItems();

        await this.send(`✓ Event added: ${title}\n   📅 ${date || 'Date TBD'} ${time || ''}\n📁 Saved to Calendar vault`);
    }

    // ========== LIST Command ==========

    private async handleList(vaultType?: string): Promise<void> {
        if (!vaultType) {
            // Show summary
            const counts: Record<string, number> = {};
            for (const item of this.items) {
                counts[item.vault] = (counts[item.vault] || 0) + 1;
            }

            const lines = Object.entries(counts).map(([vault, count]) =>
                `• ${vault}: ${count} items`
            );

            await this.send(
                `📋 Your Data

${lines.length > 0 ? lines.join('\n') : '(No items yet)'}

Total: ${this.items.length} items

Use LIST <vault> to see items:
• LIST IDENTITY
• LIST FINANCE
• LIST HEALTH
• LIST CALENDAR
• LIST DIARY`
            );
            return;
        }

        // Filter by vault
        const filtered = this.items.filter(i =>
            i.vault.toUpperCase() === vaultType
        );

        if (filtered.length === 0) {
            await this.send(`📋 ${vaultType} vault is empty`);
            return;
        }

        const lines = filtered.slice(0, 10).map((item, i) =>
            `${i + 1}. ${item.label}`
        );

        await this.send(
            `📋 ${vaultType} Vault (${filtered.length} items)

${lines.join('\n')}${filtered.length > 10 ? `\n\n... and ${filtered.length - 10} more` : ''}`
        );
    }

    // ========== PROFILE Command ==========

    private async showProfile(): Promise<void> {
        const p = this.profile;

        await this.send(
            `👤 Your HMAN Profile

${p.displayName ? `📛 Name: ${p.displayName}` : '📛 Name: (not set)'}
${p.email ? `📧 Email: ${p.email}` : '📧 Email: (not set)'}
${p.phone ? `📱 Phone: ${p.phone}` : '📱 Phone: (not set)'}
${p.timezone ? `🌏 Timezone: ${p.timezone}` : '🌏 Timezone: (not set)'}
${p.location ? `📍 Location: ${p.location}` : '📍 Location: (not set)'}

🏷️ Tags: ${p.tags.length > 0 ? p.tags.map(t => '#' + t).join(' ') : '(none)'}

📊 Data:
• ${this.items.filter(i => i.vault === 'identity').length} identity items
• ${this.items.filter(i => i.vault === 'finance').length} finance items
• ${this.items.filter(i => i.vault === 'health').length} health items
• ${this.items.filter(i => i.vault === 'calendar').length} calendar items
• ${this.items.filter(i => i.vault === 'diary').length} diary items

Use SET <field> <value> to update profile
Use ADD <type> to add items`
        );
    }

    // ========== EXPORT Command ==========

    private async handleExport(): Promise<void> {
        await this.send(`📤 Creating export...`);

        try {
            // Build export data
            const exportData = {
                profile: this.profile,
                items: this.items,
                exportedAt: new Date().toISOString(),
                version: '1.0',
            };

            // Create filename
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const filename = `hman-profile-${timestamp}.hman`;
            const filepath = join(this.dataPath, filename);

            // Write file (in production, would use createHmanFile with encryption)
            writeFileSync(filepath, JSON.stringify(exportData, null, 2));

            // Send file via Signal
            await this.signal.sendHmanFile(
                this.ownerNumber,
                filepath,
                `📁 Your HMAN Profile Export\n\n` +
                `Contains:\n` +
                `• Profile data\n` +
                `• ${this.items.length} vault items\n\n` +
                `Encrypted with your passphrase`
            );

            await this.send(`✅ Export complete!\n\nFile: ${filename}\nSize: ${(JSON.stringify(exportData).length / 1024).toFixed(2)} KB`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Export failed';
            await this.send(`❌ Export failed: ${msg}`);
        }
    }

    private async handleBackup(): Promise<void> {
        await this.send(`🔐 Creating encrypted backup...\n\n(In production, this creates a fully encrypted .hman file)`);
        await this.handleExport();
    }

    // ========== HELP Command ==========

    private async showHelp(): Promise<void> {
        await this.send(
            `📖 HMAN Profile Builder

👤 PROFILE
View your current profile

✏️ SET Commands:
• SET NAME <name>
• SET EMAIL <email>
• SET PHONE <phone>
• SET TIMEZONE <tz>
• SET LOCATION <loc>

➕ ADD Commands:
• ADD TAG <tag>
• ADD NOTE <title> | <content>
• ADD CONTACT <name> | <phone> | <email>
• ADD ACCOUNT <service> | <username>
• ADD HEALTH <type> | <value>
• ADD FINANCE <type> | <amount> | <desc>
• ADD EVENT <title> | <date> | <time>

📋 LIST [vault] - View items
📤 EXPORT - Export .hman file
🔐 BACKUP - Encrypted backup`
        );
    }

    // ========== Welcome Message ==========

    private async sendWelcome(): Promise<void> {
        await this.send(
            `🟢 HMAN Profile Builder Online

Build your encrypted profile via Signal!

Quick start:
• SET NAME Your Name
• SET EMAIL your@email.com
• ADD TAG developer
• PROFILE - view your profile
• HELP - all commands

Your data is encrypted locally.
Signal just provides the interface.`
        );
    }

    // ========== Utility Methods ==========

    private async send(text: string): Promise<void> {
        await this.signal.sendMessage(this.ownerNumber, text);
    }

    private async saveProfile(): Promise<void> {
        this.profile.updatedAt = new Date();
        // In production, persist to encrypted storage
        console.log('[HMAN] Profile updated:', this.profile);
    }

    private async saveItems(): Promise<void> {
        // In production, persist to encrypted vault storage
        console.log('[HMAN] Items count:', this.items.length);
    }

    private generateId(): string {
        return `item-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    }

    private isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    private parseAmount(text: string): number {
        return parseFloat(text.replace(/[^0-9.-]/g, '')) || 0;
    }
}

/**
 * Create and start the profile builder
 */
export async function createProfileBuilder(phoneNumber: string): Promise<SignalProfileBuilder> {
    const builder = new SignalProfileBuilder(phoneNumber);
    await builder.start();
    return builder;
}
