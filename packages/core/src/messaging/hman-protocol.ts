/**
 * .hman Protocol - Signal-to-LLM Access Control Bridge
 * 
 * The simplest possible implementation of human-managed AI access:
 * 
 * 1. LLM requests access via MCP
 * 2. .hman forwards request to user via Signal
 * 3. User replies APPROVE/DENY in Signal
 * 4. .hman returns data (or denial) to LLM
 * 
 * Signal IS the control plane. No dashboard. No web UI.
 * Just you, your phone, and complete control over your data.
 */

import { EventEmitter } from 'events';
import { SignalService, SignalMessage, createSignalService } from './signal.js';
import type { AccessRequest, PermissionLevel } from '@hman/shared';

// Access request from an LLM
export interface LLMAccessRequest {
    id: string;
    llm: {
        name: string;        // "Claude", "GPT-4", etc.
        model?: string;      // "claude-3-opus", etc.
        provider: string;    // "Anthropic", "OpenAI", etc.
    };
    resource: {
        type: string;        // "calendar", "finance", "health", etc.
        uri: string;         // "hman://calendar/events"
        description: string; // "Calendar events for next week"
    };
    purpose: string;       // Why the LLM needs this data
    timestamp: Date;
    expiresAt?: Date;      // Request expires if not approved
}

// Access decision from human
export interface AccessDecision {
    requestId: string;
    approved: boolean;
    duration?: number;     // How long access is granted (ms)
    reason?: string;       // Optional reason for decision
    respondedAt: Date;
}

// Data release after approval
export interface DataRelease {
    requestId: string;
    resource: string;
    data: unknown;         // The actual data being released
    expiresAt?: Date;      // When this access expires
    releasedAt: Date;
}

/**
 * .hman Protocol Bridge
 * 
 * Connects LLM access requests to human approval via Signal.
 */
export class HmanProtocol extends EventEmitter {
    private signal: SignalService;
    private ownerNumber: string;

    // Pending requests waiting for human approval
    private pendingRequests: Map<string, {
        request: LLMAccessRequest;
        resolve: (decision: AccessDecision) => void;
        timer?: NodeJS.Timeout;
    }> = new Map();

    // Request ID counter (A, B, C, etc. for easy reference)
    private requestCounter = 0;

    // Data store (in production, this would be encrypted vaults)
    private dataStore: Map<string, unknown> = new Map();

    constructor(ownerNumber: string) {
        super();
        this.ownerNumber = ownerNumber;
        this.signal = createSignalService(ownerNumber);

        // Listen for Signal responses
        this.signal.on('message', (msg) => this.handleSignalMessage(msg));
    }

    /**
     * Initialize the protocol bridge
     */
    async start(): Promise<void> {
        console.log('[.hman] Starting protocol bridge...');

        const status = await this.signal.checkInstallation();
        if (!status.installed || !status.registered) {
            throw new Error('Signal not configured. Link your account first.');
        }

        await this.signal.startDaemon();

        await this.notify('🔐 .hman Protocol Active\n\nLLMs will ask for permission via Signal.\nReply APPROVE or DENY to control access.');

        console.log('[.hman] Protocol bridge ready. Waiting for LLM requests...');
    }

    /**
     * Stop the protocol bridge
     */
    async stop(): Promise<void> {
        await this.notify('🔴 .hman Protocol Offline');
        await this.signal.stopDaemon();
    }

    // ========== LLM Interface ==========

    /**
     * Request access from an LLM
     * 
     * This is called by the MCP server when an LLM wants data.
     * Returns a promise that resolves when the human responds.
     */
    async requestAccess(
        request: LLMAccessRequest,
        timeout: number = 5 * 60 * 1000  // 5 minutes default
    ): Promise<AccessDecision> {
        // Generate short ID (A, B, C, etc.)
        const shortId = String.fromCharCode(65 + (this.requestCounter++ % 26));
        const requestWithId = { ...request, id: shortId };

        console.log(`[.hman] Access request from ${request.llm.name}: ${request.resource.uri}`);

        // Send to Signal
        await this.sendAccessRequest(requestWithId);

        // Wait for human response
        return new Promise((resolve) => {
            // Set up timeout
            const timer = setTimeout(() => {
                this.pendingRequests.delete(shortId);
                resolve({
                    requestId: shortId,
                    approved: false,
                    reason: 'Request timed out',
                    respondedAt: new Date(),
                });
            }, timeout);

            // Store pending request
            this.pendingRequests.set(shortId, {
                request: requestWithId,
                resolve,
                timer,
            });
        });
    }

    /**
     * Release data after approval
     */
    releaseData(requestId: string, resource: string): DataRelease | null {
        const data = this.dataStore.get(resource);

        if (!data) {
            console.log(`[.hman] No data found for resource: ${resource}`);
            return null;
        }

        return {
            requestId,
            resource,
            data,
            releasedAt: new Date(),
        };
    }

    /**
     * Store data (for demo purposes)
     */
    setData(resource: string, data: unknown): void {
        this.dataStore.set(resource, data);
    }

    // ========== Signal Interface ==========

    /**
     * Send access request to Signal
     */
    private async sendAccessRequest(request: LLMAccessRequest): Promise<void> {
        const message = `🔐 Access Request [${request.id}]

🤖 ${request.llm.name}${request.llm.model ? ` (${request.llm.model})` : ''}
📂 ${request.resource.description}
📝 "${request.purpose}"

━━━━━━━━━━━━━━━━━━━━━

Reply:
• ${request.id} - Approve
• D ${request.id} - Deny
• ${request.id} 1h - Approve for 1 hour
• D ${request.id} privacy - Deny with reason`;

        await this.signal.sendMessage(this.ownerNumber, message);
    }

    /**
     * Handle incoming Signal message
     */
    private async handleSignalMessage(msg: SignalMessage): Promise<void> {
        // Only process messages from owner
        if (msg.sender !== this.ownerNumber) return;

        const text = msg.body.trim().toUpperCase();
        const parts = msg.body.trim().split(/\s+/);

        // Parse response
        const decision = this.parseResponse(parts);

        if (!decision) {
            // Not a valid response, might be another command
            return;
        }

        // Find pending request
        const pending = this.pendingRequests.get(decision.requestId);

        if (!pending) {
            await this.notify(`⚠️ No pending request: ${decision.requestId}`);
            return;
        }

        // Clear timeout
        if (pending.timer) {
            clearTimeout(pending.timer);
        }

        // Remove from pending
        this.pendingRequests.delete(decision.requestId);

        // Send confirmation
        if (decision.approved) {
            const durationText = decision.duration
                ? ` for ${this.formatDuration(decision.duration)}`
                : '';
            await this.notify(
                `✅ Approved [${decision.requestId}]${durationText}\n\n` +
                `${pending.request.llm.name} now has access to:\n` +
                `${pending.request.resource.description}`
            );
        } else {
            await this.notify(
                `🚫 Denied [${decision.requestId}]\n\n` +
                `${pending.request.llm.name} was denied access.` +
                (decision.reason ? `\nReason: ${decision.reason}` : '')
            );
        }

        // Emit event
        this.emit('decision', decision);

        // Resolve the promise
        pending.resolve(decision);
    }

    /**
     * Parse response from Signal message
     */
    private parseResponse(parts: string[]): AccessDecision | null {
        if (parts.length === 0) return null;

        const first = parts[0].toUpperCase();

        // Deny: "D A" or "DENY A" or "N A" or "NO A"
        if (['D', 'DENY', 'N', 'NO', 'REJECT'].includes(first)) {
            const requestId = parts[1]?.toUpperCase();
            if (!requestId || requestId.length !== 1) return null;

            const reason = parts.slice(2).join(' ') || undefined;

            return {
                requestId,
                approved: false,
                reason,
                respondedAt: new Date(),
            };
        }

        // Approve: "A" or "A 1h" or just the letter
        if (first.length === 1 && first >= 'A' && first <= 'Z') {
            const requestId = first;
            const durationStr = parts[1];
            let duration: number | undefined;

            if (durationStr) {
                duration = this.parseDuration(durationStr);
            }

            return {
                requestId,
                approved: true,
                duration,
                respondedAt: new Date(),
            };
        }

        // Approve with keyword: "APPROVE A" or "YES A" or "OK A"
        if (['APPROVE', 'YES', 'OK', 'Y', 'ALLOW'].includes(first)) {
            const requestId = parts[1]?.toUpperCase();
            if (!requestId || requestId.length !== 1) return null;

            const durationStr = parts[2];
            let duration: number | undefined;

            if (durationStr) {
                duration = this.parseDuration(durationStr);
            }

            return {
                requestId,
                approved: true,
                duration,
                respondedAt: new Date(),
            };
        }

        return null;
    }

    // ========== Utility Methods ==========

    private async notify(message: string): Promise<void> {
        await this.signal.sendMessage(this.ownerNumber, message);
    }

    private parseDuration(text: string): number | undefined {
        const match = text.match(/^(\d+)([mhd])$/i);
        if (!match) return undefined;

        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        switch (unit) {
            case 'm': return value * 60 * 1000;           // minutes
            case 'h': return value * 60 * 60 * 1000;      // hours
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

    // ========== Status Methods ==========

    getPendingRequests(): LLMAccessRequest[] {
        return Array.from(this.pendingRequests.values()).map(p => p.request);
    }

    getPendingCount(): number {
        return this.pendingRequests.size;
    }
}

/**
 * Create and start the .hman protocol bridge
 */
export async function createHmanProtocol(phoneNumber: string): Promise<HmanProtocol> {
    const protocol = new HmanProtocol(phoneNumber);
    await protocol.start();
    return protocol;
}

// ========== MCP Integration ==========

/**
 * Example: How an MCP server uses the .hman protocol
 */
export async function exampleMCPUsage(protocol: HmanProtocol): Promise<void> {
    // Seed some demo data
    protocol.setData('calendar/events', [
        { title: 'Team Meeting', date: '2024-12-28', time: '10:00' },
        { title: 'Doctor Appointment', date: '2024-12-29', time: '14:30' },
    ]);

    protocol.setData('finance/transactions', [
        { type: 'income', amount: 5000, description: 'Salary' },
        { type: 'expense', amount: 150, description: 'Groceries' },
    ]);

    // Simulate an LLM access request
    const decision = await protocol.requestAccess({
        id: '', // Will be assigned
        llm: {
            name: 'Claude',
            model: 'claude-3-opus',
            provider: 'Anthropic',
        },
        resource: {
            type: 'calendar',
            uri: 'hman://calendar/events',
            description: 'Calendar events for next week',
        },
        purpose: 'Help you plan your week and suggest optimal meeting times',
        timestamp: new Date(),
    });

    if (decision.approved) {
        const data = protocol.releaseData(decision.requestId, 'calendar/events');
        console.log('[MCP] Released data:', data);
    } else {
        console.log('[MCP] Access denied:', decision.reason);
    }
}
