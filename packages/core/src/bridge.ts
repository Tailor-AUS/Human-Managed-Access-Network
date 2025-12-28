/**
 * HMAN Bridge
 * 
 * Connects AI requests (via MCP or API) to the Signal client.
 * This is a simplified bridge that handles session codes and approval flow.
 * 
 * Architecture:
 * 
 *   ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
 *   │  Claude/GPT/AI  │ ──► │     Bridge      │ ──► │  Signal Client  │
 *   │                 │     │                 │     │                 │
 *   │  Uses session   │     │ Session mgmt    │     │  Sends/receives │
 *   │  code to link   │     │ Request relay   │     │  via Signal     │
 *   └─────────────────┘     └─────────────────┘     └────────┬────────┘
 *                                                            │
 *                                                            ▼
 *                                                   ┌─────────────────┐
 *                                                   │     User        │
 *                                                   │   (Signal app)  │
 *                                                   │                 │
 *                                                   │  Replies Y/N    │
 *                                                   └─────────────────┘
 */

import { createSignalClient, SignalClient, Session } from './signal/index.js';

export interface BridgeConfig {
    /** Signal phone number (with country code) */
    phoneNumber: string;
    /** Signal-cli path */
    signalCliPath?: string;
    /** Default timeout for approval requests (ms) */
    approvalTimeout?: number;
}

export interface DataRequest {
    /** What is being requested */
    resource: string;
    /** Purpose of the request */
    purpose?: string;
    /** Available options (default Y/N) */
    options?: string[];
}

export interface ApprovalResult {
    /** Whether the request was approved */
    approved: boolean;
    /** The user's response (Y, N, A, B, C, etc.) */
    response: string | null;
    /** Reason for denial (if denied) */
    reason?: string;
}

/**
 * HMAN Bridge - connects AI to Signal
 */
export class HmanBridge {
    private signal: SignalClient;
    private config: BridgeConfig;
    private activeSession: Session | null = null;

    constructor(config: BridgeConfig) {
        this.config = {
            approvalTimeout: 60000, // 1 minute
            ...config,
        };

        // Create Signal client
        this.signal = createSignalClient({
            phoneNumber: config.phoneNumber,
            signalCliPath: config.signalCliPath,
        });
    }

    /**
     * Start the bridge
     */
    async start(): Promise<void> {
        console.log('[Bridge] Starting HMAN Bridge...');
        await this.signal.start();
        console.log('[Bridge] Bridge started');
    }

    /**
     * Stop the bridge
     */
    async stop(): Promise<void> {
        await this.signal.stop();
        console.log('[Bridge] Bridge stopped');
    }

    /**
     * Get the Signal client (for handling incoming messages)
     */
    getSignalClient(): SignalClient {
        return this.signal;
    }

    /**
     * Link a session code from an AI
     */
    async link(code: string, serviceName: string): Promise<Session | null> {
        const session = await this.signal.linkSession(code, serviceName);
        if (session) {
            this.activeSession = session;
            console.log(`[Bridge] Linked session: ${session.id} for ${serviceName}`);
        }
        return session;
    }

    /**
     * Get the active session
     */
    getActiveSession(): Session | null {
        return this.activeSession;
    }

    /**
     * Request approval from the user for data access
     */
    async requestDataApproval(request: DataRequest): Promise<ApprovalResult> {
        if (!this.activeSession) {
            return {
                approved: false,
                response: null,
                reason: 'No active session. User must generate a session code first.',
            };
        }

        // Format the request message
        const message = this.formatRequest(request);
        const options = request.options || ['Y', 'N'];

        // Request approval via Signal
        const response = await this.signal.requestApproval(
            this.activeSession.id,
            message,
            options,
            this.config.approvalTimeout
        );

        if (!response) {
            return {
                approved: false,
                response: null,
                reason: 'Request timed out or was not answered.',
            };
        }

        // Interpret response
        const approved = response === 'Y' || response === 'A';

        return {
            approved,
            response,
            reason: approved ? undefined : `User responded: ${response}`,
        };
    }

    /**
     * Request approval for a payment
     */
    async requestPaymentApproval(
        payee: string,
        amount: number,
        currency: string = 'AUD'
    ): Promise<ApprovalResult & { method?: string }> {
        if (!this.activeSession) {
            return {
                approved: false,
                response: null,
                reason: 'No active session.',
            };
        }

        const message = `Payment to ${payee}\n\nAmount: ${currency} ${amount.toFixed(2)}`;
        const options = ['A', 'B', 'C', 'N'];

        const response = await this.signal.requestApproval(
            this.activeSession.id,
            `${message}\n\nA) Share credit card\nB) Use BSB/Account\nC) Pay via PayID\nN) Deny`,
            options,
            this.config.approvalTimeout
        );

        if (!response || response === 'N') {
            return {
                approved: false,
                response,
                reason: response === 'N' ? 'User denied payment.' : 'Request timed out.',
            };
        }

        const methods: Record<string, string> = {
            A: 'credit_card',
            B: 'bsb_account',
            C: 'payid',
        };

        return {
            approved: true,
            response,
            method: methods[response],
        };
    }

    /**
     * Request approval for an action
     */
    async requestActionApproval(
        action: string,
        description?: string
    ): Promise<ApprovalResult> {
        if (!this.activeSession) {
            return {
                approved: false,
                response: null,
                reason: 'No active session.',
            };
        }

        let message = `Action: ${action}`;
        if (description) {
            message += `\n\n${description}`;
        }

        const response = await this.signal.requestApproval(
            this.activeSession.id,
            message,
            ['Y', 'N'],
            this.config.approvalTimeout
        );

        return {
            approved: response === 'Y',
            response,
            reason: response === 'N' ? 'User denied the action.' : undefined,
        };
    }

    /**
     * Format a data request for display in Signal
     */
    private formatRequest(request: DataRequest): string {
        let message = `Wants: ${request.resource}`;
        if (request.purpose) {
            message += `\n\nPurpose: ${request.purpose}`;
        }
        return message;
    }
}

/**
 * Create an HMAN Bridge
 */
export function createBridge(config: BridgeConfig): HmanBridge {
    return new HmanBridge(config);
}
