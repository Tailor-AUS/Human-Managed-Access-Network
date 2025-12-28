/**
 * HMAN Signal Client
 * 
 * Handles communication with users via Signal messenger.
 * Uses signal-cli under the hood for sending/receiving messages.
 * 
 * Flow:
 * 1. User generates session code via Signal ("code")
 * 2. AI connects with that code via MCP
 * 3. AI requests data/action
 * 4. We send request to user via Signal
 * 5. User replies Y/N or A/B/C
 * 6. We return decision to MCP
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface SignalConfig {
    /** Phone number for the Signal account (with country code) */
    phoneNumber: string;
    /** Path to signal-cli executable */
    signalCliPath?: string;
    /** Config directory for signal-cli */
    configPath?: string;
}

export interface SignalMessage {
    from: string;
    to: string;
    message: string;
    timestamp: Date;
}

export interface PendingRequest {
    id: string;
    userPhone: string;
    message: string;
    options: string[];
    createdAt: Date;
    expiresAt: Date;
    resolve: (response: string | null) => void;
}

/**
 * Session code for linking AI to user
 */
export interface SessionCode {
    code: string;
    userPhone: string;
    createdAt: Date;
    expiresAt: Date;
    used: boolean;
}

/**
 * Active session between AI and user
 */
export interface Session {
    id: string;
    userPhone: string;
    serviceName: string;
    createdAt: Date;
    lastActivity: Date;
}

/**
 * Generate a random session code
 */
function generateCode(length: number = 6): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for clarity
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * HMAN Signal Client
 */
export class SignalClient extends EventEmitter {
    private config: SignalConfig;
    private pendingRequests: Map<string, PendingRequest> = new Map();
    private sessionCodes: Map<string, SessionCode> = new Map();
    private sessions: Map<string, Session> = new Map();
    private userSessions: Map<string, string> = new Map(); // phone -> session id
    private daemon: ChildProcess | null = null;
    private isRunning: boolean = false;

    constructor(config: SignalConfig) {
        super();
        this.config = {
            signalCliPath: 'signal-cli',
            ...config,
        };
    }

    /**
     * Start listening for incoming messages
     */
    async start(): Promise<void> {
        if (this.isRunning) return;

        console.log('[Signal] Starting Signal client...');

        // In production, this would start signal-cli in daemon mode
        // For now, we'll simulate it
        this.isRunning = true;

        // Cleanup expired codes every 10 seconds
        setInterval(() => this.cleanupExpired(), 10000);

        console.log('[Signal] Client started');
        this.emit('ready');
    }

    /**
     * Stop the client
     */
    async stop(): Promise<void> {
        this.isRunning = false;
        if (this.daemon) {
            this.daemon.kill();
            this.daemon = null;
        }
        console.log('[Signal] Client stopped');
    }

    /**
     * Handle an incoming message from a user
     */
    async handleIncomingMessage(from: string, message: string): Promise<string> {
        const text = message.trim().toLowerCase();

        console.log(`[Signal] Message from ${from}: ${message}`);

        // Command: start - register user
        if (text === 'start') {
            return this.handleStart(from);
        }

        // Command: code - generate session code
        if (text === 'code') {
            return this.handleGenerateCode(from);
        }

        // Command: status - show active sessions
        if (text === 'status') {
            return this.handleStatus(from);
        }

        // Command: revoke - end all sessions
        if (text === 'revoke') {
            return this.handleRevoke(from);
        }

        // Command: help - show commands
        if (text === 'help') {
            return this.handleHelp();
        }

        // Check if this is a response to a pending request
        const response = await this.handlePendingResponse(from, message);
        if (response) {
            return response;
        }

        // Unknown command
        return 'Unknown command. Send "help" for available commands.';
    }

    /**
     * Handle 'start' command - register user
     */
    private handleStart(phone: string): string {
        console.log(`[Signal] User ${phone} registered`);
        return `Welcome to .HMAN!

Your personal API is ready.

Commands:
• code - Generate a session code
• status - View active connections
• revoke - End all sessions
• help - Show this message

When you want to connect an AI:
1. Send "code"
2. Give the code to the AI
3. Approve requests when they come`;
    }

    /**
     * Handle 'code' command - generate session code
     */
    private handleGenerateCode(phone: string): string {
        // Clean up any existing unused codes for this user
        for (const [code, session] of this.sessionCodes) {
            if (session.userPhone === phone && !session.used) {
                this.sessionCodes.delete(code);
            }
        }

        // Generate new code
        const code = generateCode(6);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

        this.sessionCodes.set(code, {
            code,
            userPhone: phone,
            createdAt: now,
            expiresAt,
            used: false,
        });

        console.log(`[Signal] Generated code ${code} for ${phone}`);

        return `Your session code:

${code}

Valid for 5 minutes.
Give this to any AI to connect.`;
    }

    /**
     * Handle 'status' command - show active sessions
     */
    private handleStatus(phone: string): string {
        const activeSessions: Session[] = [];

        for (const session of this.sessions.values()) {
            if (session.userPhone === phone) {
                activeSessions.push(session);
            }
        }

        if (activeSessions.length === 0) {
            return 'No active sessions.\n\nSend "code" to generate a session code.';
        }

        const lines = activeSessions.map(s => {
            const age = Math.floor((Date.now() - s.createdAt.getTime()) / 1000 / 60);
            return `• ${s.serviceName} (${age}m ago)`;
        });

        return `Active sessions:\n\n${lines.join('\n')}\n\nSend "revoke" to end all sessions.`;
    }

    /**
     * Handle 'revoke' command - end all sessions
     */
    private handleRevoke(phone: string): string {
        let count = 0;

        for (const [id, session] of this.sessions) {
            if (session.userPhone === phone) {
                this.sessions.delete(id);
                count++;
            }
        }

        this.userSessions.delete(phone);

        if (count === 0) {
            return 'No active sessions to revoke.';
        }

        console.log(`[Signal] Revoked ${count} sessions for ${phone}`);
        return `✓ Revoked ${count} session${count > 1 ? 's' : ''}.`;
    }

    /**
     * Handle 'help' command
     */
    private handleHelp(): string {
        return `.HMAN Commands:

• start - Get started
• code - Generate session code
• status - View active connections
• revoke - End all sessions
• help - Show this message

When an AI requests access, you'll receive a message. Reply with your choice (Y/N or A/B/C).`;
    }

    /**
     * Check if message is a response to a pending request
     */
    private async handlePendingResponse(phone: string, message: string): Promise<string | null> {
        // Find pending request for this user
        for (const [id, request] of this.pendingRequests) {
            if (request.userPhone === phone) {
                const response = message.trim().toUpperCase();

                // Validate response
                if (request.options.includes(response)) {
                    request.resolve(response);
                    this.pendingRequests.delete(id);

                    if (response === 'Y' || response === 'A') {
                        return '✓ Approved.';
                    } else if (response === 'N') {
                        return '✗ Denied.';
                    } else {
                        return `✓ Selected: ${response}`;
                    }
                } else {
                    return `Invalid response. Reply with: ${request.options.join(', ')}`;
                }
            }
        }

        return null;
    }

    /**
     * Link a session code to an AI service
     */
    async linkSession(code: string, serviceName: string): Promise<Session | null> {
        const sessionCode = this.sessionCodes.get(code.toUpperCase());

        if (!sessionCode) {
            console.log(`[Signal] Invalid code: ${code}`);
            return null;
        }

        if (sessionCode.used) {
            console.log(`[Signal] Code already used: ${code}`);
            return null;
        }

        if (new Date() > sessionCode.expiresAt) {
            console.log(`[Signal] Code expired: ${code}`);
            this.sessionCodes.delete(code);
            return null;
        }

        // Mark code as used
        sessionCode.used = true;

        // Create session
        const session: Session = {
            id: generateId(),
            userPhone: sessionCode.userPhone,
            serviceName,
            createdAt: new Date(),
            lastActivity: new Date(),
        };

        this.sessions.set(session.id, session);
        this.userSessions.set(session.userPhone, session.id);

        // Notify user
        await this.sendMessage(
            session.userPhone,
            `✓ ${serviceName} connected.\n\nThey can now request access to your data. You'll approve each request.`
        );

        console.log(`[Signal] Session created: ${session.id} for ${serviceName}`);
        return session;
    }

    /**
     * Get session by ID
     */
    getSession(sessionId: string): Session | null {
        return this.sessions.get(sessionId) || null;
    }

    /**
     * Request approval from user
     */
    async requestApproval(
        sessionId: string,
        message: string,
        options: string[] = ['Y', 'N'],
        timeoutMs: number = 60000
    ): Promise<string | null> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            console.log(`[Signal] Session not found: ${sessionId}`);
            return null;
        }

        // Update session activity
        session.lastActivity = new Date();

        // Create pending request
        const requestId = generateId();
        const now = new Date();

        // Format message with options
        let fullMessage = `Request from ${session.serviceName}:\n\n${message}\n\n`;
        if (options.length === 2 && options[0] === 'Y' && options[1] === 'N') {
            fullMessage += 'Reply Y to approve\nReply N to deny';
        } else {
            fullMessage += options.map(o => `${o})`).join('\n');
        }

        // Send to user
        await this.sendMessage(session.userPhone, fullMessage);

        // Wait for response
        return new Promise((resolve) => {
            const request: PendingRequest = {
                id: requestId,
                userPhone: session.userPhone,
                message,
                options,
                createdAt: now,
                expiresAt: new Date(now.getTime() + timeoutMs),
                resolve,
            };

            this.pendingRequests.set(requestId, request);

            // Timeout
            setTimeout(() => {
                if (this.pendingRequests.has(requestId)) {
                    this.pendingRequests.delete(requestId);
                    this.sendMessage(session.userPhone, '⏰ Request timed out.');
                    resolve(null);
                }
            }, timeoutMs);
        });
    }

    /**
     * Send a message to a user
     */
    async sendMessage(to: string, message: string): Promise<void> {
        console.log(`[Signal] Sending to ${to}: ${message.substring(0, 50)}...`);

        // In production, this would use signal-cli to send
        // For now, emit an event that can be picked up by test code
        this.emit('outgoing', { to, message, timestamp: new Date() });
    }

    /**
     * Cleanup expired codes and requests
     */
    private cleanupExpired(): void {
        const now = new Date();

        // Cleanup expired codes
        for (const [code, session] of this.sessionCodes) {
            if (now > session.expiresAt) {
                this.sessionCodes.delete(code);
            }
        }

        // Cleanup expired requests (handled by timeout, but double-check)
        for (const [id, request] of this.pendingRequests) {
            if (now > request.expiresAt) {
                request.resolve(null);
                this.pendingRequests.delete(id);
            }
        }
    }
}

/**
 * Create a Signal client
 */
export function createSignalClient(config: SignalConfig): SignalClient {
    return new SignalClient(config);
}
