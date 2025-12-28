/**
 * HMAN Bridge
 * 
 * Connects AI to Signal client with full trust level support.
 * 
 * Trust Levels:
 * - Level 1: Manual - user provides data on response
 * - Level 2: Connected - auto-fetch from OAuth services after approval
 * - Level 3: Pre-Approved - auto-approve based on rules
 */

import {
    createSignalClient,
    SignalClient,
    Session,
    TrustLevel,
    User,
    RequestResponse,
} from './signal/index.js';

export interface BridgeConfig {
    phoneNumber: string;
    signalCliPath?: string;
    approvalTimeout?: number;
}

export interface DataRequest {
    type: string;           // 'calendar', 'contacts', etc.
    purpose?: string;       // Why the AI needs it
    scopes?: string[];      // Specific scopes requested
}

export interface DataResponse {
    approved: boolean;
    autoApproved: boolean;
    trustLevel: TrustLevel;
    data?: unknown;
    reason?: string;
    providedBy: 'user' | 'connection' | 'auto';
}

/**
 * Mock data fetcher - in production would use real OAuth
 */
async function fetchFromConnection(
    user: User,
    dataType: string
): Promise<unknown | null> {
    const connection = user.connections.find(c => {
        // Map data types to services
        if (dataType === 'calendar' && c.service === 'google') return true;
        if (dataType === 'contacts' && c.service === 'google') return true;
        if (dataType === 'email' && c.service === 'microsoft') return true;
        return false;
    });

    if (!connection) return null;

    // Mock data - in production, would call real APIs
    const mockData: Record<string, unknown> = {
        calendar: [
            { title: 'Team Standup', date: '2024-01-15 09:00' },
            { title: 'Project Review', date: '2024-01-15 14:00' },
        ],
        contacts: [
            { name: 'Alice', email: 'alice@example.com' },
            { name: 'Bob', email: 'bob@example.com' },
        ],
        email: [
            { subject: 'Meeting Notes', from: 'team@company.com' },
        ],
    };

    return mockData[dataType] || null;
}

/**
 * HMAN Bridge
 */
export class HmanBridge {
    private signal: SignalClient;
    private config: BridgeConfig;
    private activeSession: Session | null = null;

    constructor(config: BridgeConfig) {
        this.config = {
            approvalTimeout: 60000,
            ...config,
        };

        this.signal = createSignalClient({
            phoneNumber: config.phoneNumber,
            signalCliPath: config.signalCliPath,
        });
    }

    async start(): Promise<void> {
        console.log('[Bridge] Starting...');
        await this.signal.start();
        console.log('[Bridge] Started');
    }

    async stop(): Promise<void> {
        await this.signal.stop();
        console.log('[Bridge] Stopped');
    }

    getSignalClient(): SignalClient {
        return this.signal;
    }

    async link(code: string, serviceName: string): Promise<Session | null> {
        const session = await this.signal.linkSession(code, serviceName);
        if (session) {
            this.activeSession = session;
            console.log(`[Bridge] Linked: ${session.id} for ${serviceName}`);
        }
        return session;
    }

    getActiveSession(): Session | null {
        return this.activeSession;
    }

    /**
     * Request data from user - respects trust levels
     */
    async requestData(request: DataRequest): Promise<DataResponse> {
        if (!this.activeSession) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'No active session',
                providedBy: 'user',
            };
        }

        const user = this.signal.getUser(this.activeSession.userPhone);
        if (!user) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'User not found',
                providedBy: 'user',
            };
        }

        // Request approval (handles Level 3 auto-approve internally)
        const response = await this.signal.requestApproval(
            this.activeSession.id,
            request.type,
            request.purpose,
            ['Y', 'N'],
            this.config.approvalTimeout
        );

        if (!response.approved) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: user.trustLevel,
                reason: response.response === 'N' ? 'User denied' : 'Request timed out',
                providedBy: 'user',
            };
        }

        // ===================
        // LEVEL 1: Manual - user will provide data
        // ===================
        if (user.trustLevel === TrustLevel.Manual) {
            return {
                approved: true,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                data: null, // User will provide via Signal
                providedBy: 'user',
            };
        }

        // ===================
        // LEVEL 2 & 3: Connected - fetch from OAuth
        // ===================
        const data = await fetchFromConnection(user, request.type);

        return {
            approved: true,
            autoApproved: response.autoApproved || false,
            trustLevel: user.trustLevel,
            data,
            providedBy: data ? 'connection' : 'user',
        };
    }

    /**
     * Request a payment
     */
    async requestPayment(
        payee: string,
        amount: number,
        currency: string = 'AUD'
    ): Promise<DataResponse & { method?: string }> {
        if (!this.activeSession) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'No active session',
                providedBy: 'user',
            };
        }

        const user = this.signal.getUser(this.activeSession.userPhone);
        if (!user) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'User not found',
                providedBy: 'user',
            };
        }

        // Payments always require explicit approval (never auto-approved)
        const message = `Payment: ${currency} ${amount.toFixed(2)} to ${payee}`;

        await this.signal.sendMessage(
            this.activeSession.userPhone,
            `${message}\n\nA) Share card\nB) BSB/Account\nC) PayID\nN) Deny`
        );

        // For now, return pending - in production would wait for response
        return {
            approved: false,
            autoApproved: false,
            trustLevel: user.trustLevel,
            reason: 'Awaiting payment approval',
            providedBy: 'user',
        };
    }

    /**
     * Request to perform an action
     */
    async requestAction(
        action: string,
        description?: string
    ): Promise<DataResponse> {
        if (!this.activeSession) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'No active session',
                providedBy: 'user',
            };
        }

        const user = this.signal.getUser(this.activeSession.userPhone);
        if (!user) {
            return {
                approved: false,
                autoApproved: false,
                trustLevel: TrustLevel.Manual,
                reason: 'User not found',
                providedBy: 'user',
            };
        }

        const response = await this.signal.requestApproval(
            this.activeSession.id,
            action,
            description,
            ['Y', 'N'],
            this.config.approvalTimeout
        );

        return {
            approved: response.approved,
            autoApproved: response.autoApproved || false,
            trustLevel: user.trustLevel,
            reason: response.approved ? undefined : 'User denied',
            providedBy: response.autoApproved ? 'auto' : 'user',
        };
    }
}

/**
 * Create a Bridge
 */
export function createBridge(config: BridgeConfig): HmanBridge {
    return new HmanBridge(config);
}
