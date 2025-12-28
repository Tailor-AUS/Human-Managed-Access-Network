/**
 * HMAN Signal Client
 * 
 * Implements the 3-level trust model:
 * - Level 1: Manual (default) - user pastes data
 * - Level 2: Connected - OAuth services, still approve each request
 * - Level 3: Pre-Approved - rules for auto-approval
 */

import { EventEmitter } from 'events';

// =============================================================================
// TYPES
// =============================================================================

export interface SignalConfig {
    phoneNumber: string;
    signalCliPath?: string;
}

export interface User {
    phone: string;
    trustLevel: TrustLevel;
    connections: Connection[];
    rules: ApprovalRule[];
    createdAt: Date;
}

export enum TrustLevel {
    Manual = 1,      // Default - paste data manually
    Connected = 2,   // OAuth connected, still approve each
    PreApproved = 3, // Rules for auto-approval
}

export interface Connection {
    id: string;
    service: string;        // 'google', 'microsoft', etc.
    scopes: string[];       // 'calendar.read', 'contacts.read', etc.
    connectedAt: Date;
    expiresAt?: Date;
}

export interface ApprovalRule {
    id: string;
    ai: string;             // 'Claude', 'GPT', '*' for any
    dataType: string;       // 'calendar', 'contacts', '*' for any
    action: 'read' | 'write' | 'both';
    createdAt: Date;
    expiresAt?: Date;
}

export interface SessionCode {
    code: string;
    userPhone: string;
    createdAt: Date;
    expiresAt: Date;
    used: boolean;
}

export interface Session {
    id: string;
    userPhone: string;
    serviceName: string;
    createdAt: Date;
    lastActivity: Date;
}

export interface PendingRequest {
    id: string;
    sessionId: string;
    userPhone: string;
    aiName: string;
    dataType: string;
    purpose?: string;
    options: string[];
    createdAt: Date;
    expiresAt: Date;
    resolve: (response: RequestResponse) => void;
}

export interface RequestResponse {
    approved: boolean;
    response: string | null;
    data?: unknown;
    autoApproved?: boolean;
}

export interface AuditEntry {
    id: string;
    timestamp: Date;
    ai: string;
    dataType: string;
    action: 'approved' | 'denied' | 'auto_approved';
    rule?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateCode(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// SIGNAL CLIENT
// =============================================================================

export class SignalClient extends EventEmitter {
    private config: SignalConfig;

    // User data
    private users: Map<string, User> = new Map();

    // Session management
    private sessionCodes: Map<string, SessionCode> = new Map();
    private sessions: Map<string, Session> = new Map();

    // Request handling
    private pendingRequests: Map<string, PendingRequest> = new Map();

    // Audit log
    private auditLog: AuditEntry[] = [];

    private isRunning: boolean = false;

    constructor(config: SignalConfig) {
        super();
        this.config = config;
    }

    // ---------------------------------------------------------------------------
    // LIFECYCLE
    // ---------------------------------------------------------------------------

    async start(): Promise<void> {
        if (this.isRunning) return;
        console.log('[Signal] Starting client...');
        this.isRunning = true;
        setInterval(() => this.cleanupExpired(), 10000);
        console.log('[Signal] Client started');
        this.emit('ready');
    }

    async stop(): Promise<void> {
        this.isRunning = false;
        console.log('[Signal] Client stopped');
    }

    // ---------------------------------------------------------------------------
    // MESSAGE HANDLING
    // ---------------------------------------------------------------------------

    async handleIncomingMessage(from: string, message: string): Promise<string> {
        const text = message.trim().toLowerCase();
        const parts = text.split(/\s+/);
        const command = parts[0];

        console.log(`[Signal] From ${from}: ${message}`);

        // Ensure user exists
        if (!this.users.has(from) && command !== 'start') {
            return 'Send "start" to begin.';
        }

        // ===================
        // LEVEL 1 COMMANDS
        // ===================

        if (command === 'start') return this.handleStart(from);
        if (command === 'code') return this.handleCode(from);
        if (command === 'status') return this.handleStatus(from);
        if (command === 'revoke') return this.handleRevoke(from);
        if (command === 'help') return this.handleHelp(from);
        if (command === 'level') return this.handleLevel(from);

        // ===================
        // LEVEL 2 COMMANDS
        // ===================

        if (command === 'connect') return this.handleConnect(from, parts[1]);
        if (command === 'disconnect') return this.handleDisconnect(from, parts[1]);
        if (command === 'connections') return this.handleConnections(from);

        // ===================
        // LEVEL 3 COMMANDS
        // ===================

        if (command === 'rules') return this.handleRules(from);
        if (command === 'allow') return this.handleAllow(from, parts.slice(1));
        if (command === 'deny') return this.handleDeny(from, parts[1]);
        if (command === 'audit') return this.handleAudit(from);

        // ===================
        // RESPONSE TO REQUEST
        // ===================

        const response = await this.handlePendingResponse(from, message);
        if (response) return response;

        return 'Unknown command. Send "help" for available commands.';
    }

    // ---------------------------------------------------------------------------
    // LEVEL 1: MANUAL (Default)
    // ---------------------------------------------------------------------------

    private handleStart(phone: string): string {
        if (!this.users.has(phone)) {
            this.users.set(phone, {
                phone,
                trustLevel: TrustLevel.Manual,
                connections: [],
                rules: [],
                createdAt: new Date(),
            });
        }

        return `Welcome to .HMAN!

You're at Level 1 (Manual):
• Every request needs your approval
• You provide data when asked
• Maximum control

Commands:
• code - Generate session code
• status - View sessions
• revoke - End all sessions
• level - See your trust level
• help - All commands`;
    }

    private handleCode(phone: string): string {
        // Clean up old codes for this user
        for (const [code, session] of this.sessionCodes) {
            if (session.userPhone === phone && !session.used) {
                this.sessionCodes.delete(code);
            }
        }

        const code = generateCode(6);
        const now = new Date();

        this.sessionCodes.set(code, {
            code,
            userPhone: phone,
            createdAt: now,
            expiresAt: new Date(now.getTime() + 5 * 60 * 1000), // 5 minutes
            used: false,
        });

        console.log(`[Signal] Generated code ${code} for ${phone}`);

        return `Your session code:

${code}

Valid for 5 minutes.
Give this to any AI to connect.`;
    }

    private handleStatus(phone: string): string {
        const user = this.users.get(phone);
        const activeSessions: Session[] = [];

        for (const session of this.sessions.values()) {
            if (session.userPhone === phone) {
                activeSessions.push(session);
            }
        }

        const levelName = ['', 'Manual', 'Connected', 'Pre-Approved'][user?.trustLevel || 1];

        let msg = `Trust Level: ${user?.trustLevel || 1} (${levelName})\n\n`;

        if (activeSessions.length === 0) {
            msg += 'No active sessions.';
        } else {
            msg += 'Active sessions:\n';
            for (const s of activeSessions) {
                const mins = Math.floor((Date.now() - s.createdAt.getTime()) / 60000);
                msg += `• ${s.serviceName} (${mins}m)\n`;
            }
        }

        return msg;
    }

    private handleRevoke(phone: string): string {
        let count = 0;
        for (const [id, session] of this.sessions) {
            if (session.userPhone === phone) {
                this.sessions.delete(id);
                count++;
            }
        }

        // Cancel pending requests
        for (const [id, request] of this.pendingRequests) {
            if (request.userPhone === phone) {
                request.resolve({ approved: false, response: null });
                this.pendingRequests.delete(id);
            }
        }

        return count > 0
            ? `✓ Revoked ${count} session${count > 1 ? 's' : ''}. All AIs disconnected.`
            : 'No active sessions to revoke.';
    }

    private handleLevel(phone: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        const levels = {
            1: {
                name: 'Manual',
                desc: 'You approve and provide data manually each time.',
                next: 'Send "connect <service>" to upgrade to Level 2.',
            },
            2: {
                name: 'Connected',
                desc: 'Services linked via OAuth. Still approve each request.',
                next: 'Send "allow <ai> <data>" to create auto-approve rules.',
            },
            3: {
                name: 'Pre-Approved',
                desc: 'Rules auto-approve some requests. Notified after.',
                next: 'You\'re at the highest level.',
            },
        };

        const level = levels[user.trustLevel as 1 | 2 | 3];

        return `Level ${user.trustLevel}: ${level.name}

${level.desc}

${level.next}`;
    }

    private handleHelp(phone: string): string {
        const user = this.users.get(phone);
        const level = user?.trustLevel || 1;

        let msg = `Commands:

Level 1 (Manual):
• code - Generate session code
• status - View sessions & level
• revoke - End all sessions
• level - Your trust level
• help - This message`;

        if (level >= 2) {
            msg += `

Level 2 (Connected):
• connect <service> - Link a service
• disconnect <service> - Unlink
• connections - List connected`;
        }

        if (level >= 3) {
            msg += `

Level 3 (Pre-Approved):
• rules - View auto-approve rules
• allow <ai> <data> - Add rule
• deny <ai> - Remove AI rules
• audit - View auto-approvals`;
        }

        return msg;
    }

    // ---------------------------------------------------------------------------
    // LEVEL 2: CONNECTED
    // ---------------------------------------------------------------------------

    private handleConnect(phone: string, service?: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (!service) {
            return `Available services:
• google - Calendar, Contacts, Drive
• microsoft - Outlook, OneDrive
• github - Repos, Issues

Send "connect <service>" to link.`;
        }

        // Simulate OAuth flow (in production, would return OAuth URL)
        const connection: Connection = {
            id: generateId(),
            service: service.toLowerCase(),
            scopes: ['read'], // Default to read-only
            connectedAt: new Date(),
        };

        user.connections.push(connection);

        // Upgrade to Level 2 if first connection
        if (user.trustLevel < TrustLevel.Connected) {
            user.trustLevel = TrustLevel.Connected;
        }

        return `✓ Connected to ${service}.

You're now Level 2 (Connected).
• AIs can request your ${service} data
• You still approve each request
• We fetch automatically when you say Y

Send "connections" to see all linked services.`;
    }

    private handleDisconnect(phone: string, service?: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (!service) {
            return 'Usage: disconnect <service>';
        }

        const idx = user.connections.findIndex(c => c.service === service.toLowerCase());
        if (idx === -1) {
            return `Not connected to ${service}.`;
        }

        user.connections.splice(idx, 1);

        // Downgrade if no more connections
        if (user.connections.length === 0 && user.trustLevel === TrustLevel.Connected) {
            user.trustLevel = TrustLevel.Manual;
            return `✓ Disconnected from ${service}. Back to Level 1 (Manual).`;
        }

        return `✓ Disconnected from ${service}.`;
    }

    private handleConnections(phone: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (user.connections.length === 0) {
            return 'No connected services.\n\nSend "connect" to see available services.';
        }

        let msg = 'Connected services:\n';
        for (const conn of user.connections) {
            msg += `• ${conn.service} (${conn.scopes.join(', ')})\n`;
        }

        return msg;
    }

    // ---------------------------------------------------------------------------
    // LEVEL 3: PRE-APPROVED
    // ---------------------------------------------------------------------------

    private handleRules(phone: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (user.rules.length === 0) {
            return `No auto-approve rules.

Create a rule:
allow <ai> <data>

Examples:
• allow Claude calendar
• allow GPT contacts
• allow * calendar (any AI)`;
        }

        let msg = 'Auto-approve rules:\n';
        for (const rule of user.rules) {
            msg += `• ${rule.ai} can ${rule.action} ${rule.dataType}\n`;
        }

        return msg;
    }

    private handleAllow(phone: string, args: string[]): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (args.length < 2) {
            return 'Usage: allow <ai> <data>\n\nExamples:\n• allow Claude calendar\n• allow GPT contacts';
        }

        const [ai, dataType] = args;

        // Check if they have the connection for this data type
        if (user.trustLevel < TrustLevel.Connected) {
            return 'Connect a service first (Level 2) before creating rules.';
        }

        const rule: ApprovalRule = {
            id: generateId(),
            ai: ai,
            dataType: dataType,
            action: 'read',
            createdAt: new Date(),
        };

        user.rules.push(rule);

        // Upgrade to Level 3
        if (user.trustLevel < TrustLevel.PreApproved) {
            user.trustLevel = TrustLevel.PreApproved;
        }

        return `✓ Rule added: ${ai} can read ${dataType}

You're now Level 3 (Pre-Approved).
Matching requests will auto-approve.
You'll be notified after.

Send "rules" to see all rules.`;
    }

    private handleDeny(phone: string, ai?: string): string {
        const user = this.users.get(phone);
        if (!user) return 'Send "start" first.';

        if (!ai) {
            return 'Usage: deny <ai>\n\nRemoves all rules for that AI.';
        }

        const before = user.rules.length;
        user.rules = user.rules.filter(r => r.ai.toLowerCase() !== ai.toLowerCase());
        const removed = before - user.rules.length;

        if (removed === 0) {
            return `No rules found for ${ai}.`;
        }

        // Downgrade if no more rules
        if (user.rules.length === 0 && user.trustLevel === TrustLevel.PreApproved) {
            user.trustLevel = TrustLevel.Connected;
            return `✓ Removed ${removed} rule${removed > 1 ? 's' : ''} for ${ai}. Back to Level 2.`;
        }

        return `✓ Removed ${removed} rule${removed > 1 ? 's' : ''} for ${ai}.`;
    }

    private handleAudit(phone: string): string {
        const userAudit = this.auditLog.filter(e =>
            this.sessions.get(e.id)?.userPhone === phone ||
            [...this.sessions.values()].some(s => s.userPhone === phone)
        ).slice(-10);

        if (userAudit.length === 0) {
            return 'No audit entries yet.';
        }

        let msg = 'Recent activity:\n';
        for (const entry of userAudit) {
            const time = entry.timestamp.toLocaleTimeString();
            const status = entry.action === 'auto_approved' ? '⚡' : entry.action === 'approved' ? '✓' : '✗';
            msg += `${status} ${time} - ${entry.ai} ${entry.dataType}\n`;
        }

        return msg;
    }

    // ---------------------------------------------------------------------------
    // REQUEST HANDLING
    // ---------------------------------------------------------------------------

    private async handlePendingResponse(phone: string, message: string): Promise<string | null> {
        for (const [id, request] of this.pendingRequests) {
            if (request.userPhone === phone) {
                const response = message.trim().toUpperCase();

                if (request.options.includes(response)) {
                    const approved = response === 'Y' || response === 'A';

                    request.resolve({
                        approved,
                        response,
                        autoApproved: false,
                    });
                    this.pendingRequests.delete(id);

                    // Log to audit
                    this.auditLog.push({
                        id: generateId(),
                        timestamp: new Date(),
                        ai: request.aiName,
                        dataType: request.dataType,
                        action: approved ? 'approved' : 'denied',
                    });

                    return approved
                        ? '✓ Approved.'
                        : '✗ Denied. They received nothing.';
                } else {
                    return `Invalid response. Reply: ${request.options.join(', ')}`;
                }
            }
        }
        return null;
    }

    // ---------------------------------------------------------------------------
    // SESSION MANAGEMENT (for Bridge)
    // ---------------------------------------------------------------------------

    async linkSession(code: string, serviceName: string): Promise<Session | null> {
        const sessionCode = this.sessionCodes.get(code.toUpperCase());

        if (!sessionCode || sessionCode.used || new Date() > sessionCode.expiresAt) {
            return null;
        }

        sessionCode.used = true;

        const session: Session = {
            id: generateId(),
            userPhone: sessionCode.userPhone,
            serviceName,
            createdAt: new Date(),
            lastActivity: new Date(),
        };

        this.sessions.set(session.id, session);

        await this.sendMessage(
            session.userPhone,
            `✓ ${serviceName} connected.\n\nThey can now request access. You approve each one.`
        );

        return session;
    }

    getSession(sessionId: string): Session | null {
        return this.sessions.get(sessionId) || null;
    }

    getUser(phone: string): User | null {
        return this.users.get(phone) || null;
    }

    /**
     * Request approval - respects trust levels
     */
    async requestApproval(
        sessionId: string,
        dataType: string,
        purpose?: string,
        options: string[] = ['Y', 'N'],
        timeoutMs: number = 60000
    ): Promise<RequestResponse> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return { approved: false, response: null };
        }

        const user = this.users.get(session.userPhone);
        if (!user) {
            return { approved: false, response: null };
        }

        session.lastActivity = new Date();

        // ===================
        // LEVEL 3: Check auto-approve rules
        // ===================
        if (user.trustLevel >= TrustLevel.PreApproved) {
            const matchingRule = user.rules.find(r =>
                (r.ai === '*' || r.ai.toLowerCase() === session.serviceName.toLowerCase()) &&
                (r.dataType === '*' || r.dataType.toLowerCase() === dataType.toLowerCase())
            );

            if (matchingRule) {
                // Auto-approve and notify
                await this.sendMessage(
                    session.userPhone,
                    `⚡ Auto-approved: ${session.serviceName} → ${dataType}\n(Rule: ${matchingRule.ai} can ${matchingRule.action} ${matchingRule.dataType})`
                );

                this.auditLog.push({
                    id: generateId(),
                    timestamp: new Date(),
                    ai: session.serviceName,
                    dataType,
                    action: 'auto_approved',
                    rule: matchingRule.id,
                });

                return { approved: true, response: 'Y', autoApproved: true };
            }
        }

        // ===================
        // LEVEL 1 & 2: Ask for approval
        // ===================
        let message = `${session.serviceName} wants your ${dataType}`;
        if (purpose) message += `\n\nPurpose: ${purpose}`;
        message += `\n\nY to approve\nN to deny`;

        await this.sendMessage(session.userPhone, message);

        return new Promise((resolve) => {
            const request: PendingRequest = {
                id: generateId(),
                sessionId,
                userPhone: session.userPhone,
                aiName: session.serviceName,
                dataType,
                purpose,
                options,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + timeoutMs),
                resolve,
            };

            this.pendingRequests.set(request.id, request);

            setTimeout(() => {
                if (this.pendingRequests.has(request.id)) {
                    this.pendingRequests.delete(request.id);
                    this.sendMessage(session.userPhone, '⏰ Request timed out.');
                    resolve({ approved: false, response: null });
                }
            }, timeoutMs);
        });
    }

    async sendMessage(to: string, message: string): Promise<void> {
        console.log(`[Signal] → ${to}: ${message.substring(0, 50)}...`);
        this.emit('outgoing', { to, message, timestamp: new Date() });
    }

    private cleanupExpired(): void {
        const now = new Date();
        for (const [code, session] of this.sessionCodes) {
            if (now > session.expiresAt) this.sessionCodes.delete(code);
        }
    }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSignalClient(config: SignalConfig): SignalClient {
    return new SignalClient(config);
}
