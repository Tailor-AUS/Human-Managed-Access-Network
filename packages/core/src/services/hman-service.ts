/**
 * HMAN Service - Signal-Based AI Assistant Broker
 * 
 * HMAN acts as a centralized Signal contact that:
 * 1. Users add to their Signal contacts
 * 2. LLMs connect via MCP to request permissions/tasks
 * 3. HMAN forwards requests to users via Signal
 * 4. Users approve/deny with simple text replies
 * 5. HMAN executes approved tasks and reports back
 * 
 * DATA STORAGE PHILOSOPHY - Zero Knowledge Architecture:
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * USER'S PERSONAL DATA:
 *   → Stored in USER'S Signal "Note to Self"
 *   → E2E encrypted by Signal Protocol
 *   → HMAN never stores or sees raw user data
 *   → User retains 100% ownership and control
 * 
 * HMAN SERVICE DATA (minimal):
 *   → User phone numbers (for message routing)
 *   → Connected LLM mappings (who can request what)
 *   → Pending task queue (in-memory, temporary)
 *   → Audit log (append-only, for transparency)
 * 
 * DATA FLOW:
 *   1. LLM requests data via MCP
 *   2. HMAN asks user via Signal: "Claude wants your calendar. Share?"
 *   3. User retrieves from their Note to Self, sends via Signal
 *   4. HMAN passes through to LLM (never stores)
 * 
 * Architecture:
 *   [Claude/GPT/Gemini] ←→ [HMAN MCP Server] ←→ [HMAN Signal Service] ←→ [User's Phone]
 *                              ↓
 *                    [User's Note to Self]
 *                    (Their encrypted vault)
 */

import { EventEmitter } from 'events';
import { SignalService, SignalMessage, createSignalService } from '../messaging/signal.js';
import type { PermissionLevel } from '@hman/shared';

// ========== User Types ==========

export interface HmanUser {
    id: string;
    phoneNumber: string;           // User's Signal number
    displayName?: string;
    registeredAt: Date;
    lastActive?: Date;

    // Connected LLMs
    connectedLLMs: ConnectedLLM[];

    // Preferences
    preferences: UserPreferences;

    // Profile data (stored encrypted)
    profile?: UserProfile;
}

export interface ConnectedLLM {
    id: string;
    name: string;                  // "Claude", "GPT-4", etc.
    provider: string;              // "Anthropic", "OpenAI", etc.
    permissions: LLMPermissions;
    connectedAt: Date;
    lastUsed?: Date;
}

export interface LLMPermissions {
    canRead: string[];             // ["calendar", "contacts"]
    canWrite: string[];            // ["calendar"]
    canExecute: string[];          // ["payments", "bookings"]
    autoApprove: string[];         // Actions that don't need confirmation
    requireConfirmation: string[]; // Actions that always need confirmation
}

export interface UserPreferences {
    notifyOnAccess: boolean;
    notifyOnExecution: boolean;
    defaultApprovalTimeout: number;  // ms
    quietHours?: {
        start: string;               // "22:00"
        end: string;                 // "08:00"
        timezone: string;
    };
}

export interface UserProfile {
    email?: string;
    timezone?: string;
    location?: string;
    // Payment methods, addresses, etc. (encrypted)
    paymentMethods?: PaymentMethod[];
    addresses?: Address[];
}

export interface PaymentMethod {
    id: string;
    type: 'payid' | 'card' | 'bank';
    name: string;                  // "My PayID", "Visa ending 4242"
    isDefault: boolean;
}

export interface Address {
    id: string;
    type: 'home' | 'work' | 'billing';
    formatted: string;
    isDefault: boolean;
}

// ========== Task Types ==========

export interface TaskRequest {
    id: string;
    type: 'permission' | 'execution' | 'handoff';

    // Who's requesting
    llm: {
        id: string;
        name: string;
        provider: string;
    };

    // For the user
    userId: string;

    // What's being requested
    action: {
        category: string;            // "payment", "booking", "data_access"
        operation: string;           // "pay_bill", "schedule_appointment"
        description: string;         // Human-readable description
        details: Record<string, unknown>;
    };

    // Timing
    requestedAt: Date;
    expiresAt?: Date;

    // Response (filled in after user responds)
    response?: TaskResponse;
}

export interface TaskResponse {
    approved: boolean;
    respondedAt: Date;
    respondedVia: 'signal' | 'auto' | 'timeout';
    executionResult?: ExecutionResult;
}

export interface ExecutionResult {
    success: boolean;
    completedAt: Date;
    result?: unknown;
    error?: string;
    confirmationId?: string;
}

// ========== Service Events ==========

export interface HmanServiceEvents {
    'user:registered': (user: HmanUser) => void;
    'task:requested': (task: TaskRequest) => void;
    'task:approved': (task: TaskRequest) => void;
    'task:denied': (task: TaskRequest) => void;
    'task:executed': (task: TaskRequest, result: ExecutionResult) => void;
    'llm:connected': (userId: string, llm: ConnectedLLM) => void;
}

// ========== HMAN Service ==========

/**
 * HMAN Service - The central Signal-based AI broker
 */
export class HmanService extends EventEmitter {
    private signal: SignalService;
    private hmanNumber: string;

    // User store
    private users: Map<string, HmanUser> = new Map();

    // Pending tasks waiting for user response
    private pendingTasks: Map<string, {
        task: TaskRequest;
        resolve: (response: TaskResponse) => void;
        timer?: NodeJS.Timeout;
    }> = new Map();

    // Task executors
    private executors: Map<string, TaskExecutor> = new Map();

    // Short ID counter for easy reference in Signal
    private taskCounter = 0;

    constructor(hmanNumber: string) {
        super();
        this.hmanNumber = hmanNumber;
        this.signal = createSignalService(hmanNumber);

        // Listen for Signal messages
        this.signal.on('message', (msg) => this.handleSignalMessage(msg));
    }

    // ========== Lifecycle ==========

    async start(): Promise<void> {
        console.log('[HMAN] Starting HMAN Service...');
        console.log(`[HMAN] Signal number: ${this.hmanNumber}`);

        const status = await this.signal.checkInstallation();
        if (!status.installed || !status.registered) {
            throw new Error('Signal not configured for HMAN service');
        }

        await this.signal.startDaemon();
        console.log('[HMAN] Service ready. Users can now add HMAN to Signal.');
    }

    async stop(): Promise<void> {
        await this.signal.stopDaemon();
        console.log('[HMAN] Service stopped.');
    }

    // ========== User Management ==========

    /**
     * Register a new user (called when user first messages HMAN)
     */
    async registerUser(phoneNumber: string, displayName?: string): Promise<HmanUser> {
        const existing = this.getUserByPhone(phoneNumber);
        if (existing) return existing;

        const user: HmanUser = {
            id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            phoneNumber,
            displayName,
            registeredAt: new Date(),
            connectedLLMs: [],
            preferences: {
                notifyOnAccess: true,
                notifyOnExecution: true,
                defaultApprovalTimeout: 5 * 60 * 1000, // 5 minutes
            },
        };

        this.users.set(user.id, user);
        this.emit('user:registered', user);

        // Send welcome message
        await this.sendToUser(phoneNumber,
            `👋 Welcome to HMAN!

I'm your AI access manager. When AI assistants (Claude, GPT, Gemini) need your data or want to do something on your behalf, they'll ask me, and I'll ask you.

You stay in control. Always.

Commands:
• STATUS - See your connected AIs
• HELP - See all commands
• SETTINGS - Manage preferences

Just reply to any request with:
• Y or YES - Approve
• N or NO - Deny`
        );

        return user;
    }

    getUserByPhone(phoneNumber: string): HmanUser | undefined {
        return Array.from(this.users.values()).find(u => u.phoneNumber === phoneNumber);
    }

    getUserById(userId: string): HmanUser | undefined {
        return this.users.get(userId);
    }

    // ========== LLM Interface (via MCP) ==========

    /**
     * Connect an LLM to a user's account
     */
    async connectLLM(
        userId: string,
        llmName: string,
        llmProvider: string,
        permissions: Partial<LLMPermissions> = {}
    ): Promise<ConnectedLLM> {
        const user = this.users.get(userId);
        if (!user) throw new Error('User not found');

        const llm: ConnectedLLM = {
            id: `llm-${Date.now()}`,
            name: llmName,
            provider: llmProvider,
            permissions: {
                canRead: permissions.canRead || [],
                canWrite: permissions.canWrite || [],
                canExecute: permissions.canExecute || [],
                autoApprove: permissions.autoApprove || [],
                requireConfirmation: permissions.requireConfirmation || ['payments'],
            },
            connectedAt: new Date(),
        };

        user.connectedLLMs.push(llm);
        this.emit('llm:connected', userId, llm);

        // Notify user
        await this.sendToUser(user.phoneNumber,
            `🤖 New AI Connected

${llmName} (${llmProvider}) is now connected to your HMAN account.

It can ask for:
${llm.permissions.canRead.length > 0 ? `• Read: ${llm.permissions.canRead.join(', ')}` : ''}
${llm.permissions.canExecute.length > 0 ? `• Execute: ${llm.permissions.canExecute.join(', ')}` : ''}

You'll be asked to approve each request.`
        );

        return llm;
    }

    /**
     * Request task execution from LLM
     * 
     * This is called by the MCP server when an LLM wants to do something.
     */
    async requestTask(task: Omit<TaskRequest, 'id' | 'requestedAt'>): Promise<TaskResponse> {
        const user = this.users.get(task.userId);
        if (!user) throw new Error('User not found');

        // Generate short ID
        const shortId = String.fromCharCode(65 + (this.taskCounter++ % 26));

        const fullTask: TaskRequest = {
            ...task,
            id: shortId,
            requestedAt: new Date(),
        };

        this.emit('task:requested', fullTask);

        // Check if auto-approve
        const llm = user.connectedLLMs.find(l => l.id === task.llm.id);
        if (llm?.permissions.autoApprove.includes(task.action.category)) {
            const response: TaskResponse = {
                approved: true,
                respondedAt: new Date(),
                respondedVia: 'auto',
            };
            fullTask.response = response;
            this.emit('task:approved', fullTask);
            return response;
        }

        // Send to user via Signal
        await this.sendTaskRequest(user.phoneNumber, fullTask);

        // Wait for response
        return new Promise((resolve) => {
            const timeout = user.preferences.defaultApprovalTimeout;

            const timer = setTimeout(() => {
                this.pendingTasks.delete(shortId);
                const response: TaskResponse = {
                    approved: false,
                    respondedAt: new Date(),
                    respondedVia: 'timeout',
                };
                fullTask.response = response;
                this.emit('task:denied', fullTask);
                resolve(response);
            }, timeout);

            this.pendingTasks.set(shortId, { task: fullTask, resolve, timer });
        });
    }

    // ========== Task Execution ==========

    /**
     * Register a task executor
     */
    registerExecutor(category: string, executor: TaskExecutor): void {
        this.executors.set(category, executor);
    }

    /**
     * Execute an approved task
     */
    private async executeTask(task: TaskRequest): Promise<ExecutionResult> {
        const executor = this.executors.get(task.action.category);

        if (!executor) {
            return {
                success: false,
                completedAt: new Date(),
                error: `No executor found for category: ${task.action.category}`,
            };
        }

        try {
            const result = await executor.execute(task);
            return {
                success: true,
                completedAt: new Date(),
                result,
                confirmationId: `HMAN-${Date.now()}`,
            };
        } catch (error) {
            return {
                success: false,
                completedAt: new Date(),
                error: error instanceof Error ? error.message : 'Execution failed',
            };
        }
    }

    // ========== Signal Handling ==========

    private async handleSignalMessage(msg: SignalMessage): Promise<void> {
        const userPhone = msg.sender;

        // Auto-register new users
        let user = this.getUserByPhone(userPhone);
        if (!user) {
            user = await this.registerUser(userPhone);
        }

        // Update last active
        user.lastActive = new Date();

        const text = msg.body.trim();
        const upper = text.toUpperCase();

        // Check for task responses first
        const taskResponse = this.parseTaskResponse(text);
        if (taskResponse) {
            await this.handleTaskResponse(taskResponse, user);
            return;
        }

        // Handle commands
        if (upper === 'HELP' || upper === '?') {
            await this.sendHelp(userPhone);
        } else if (upper === 'STATUS') {
            await this.sendStatus(user);
        } else if (upper === 'SETTINGS') {
            await this.sendSettings(user);
        } else {
            await this.sendToUser(userPhone,
                `❓ I didn't understand that.\n\nReply HELP for commands, or respond to a pending request with Y/N.`
            );
        }
    }

    private parseTaskResponse(text: string): { taskId: string; approved: boolean; } | null {
        const upper = text.toUpperCase().trim();
        const parts = upper.split(/\s+/);

        // Simple Y/N (applies to most recent task)
        if (['Y', 'YES', 'OK', 'APPROVE', 'ALLOW'].includes(upper)) {
            const mostRecent = this.getMostRecentPendingTask();
            if (mostRecent) {
                return { taskId: mostRecent.id, approved: true };
            }
        }

        if (['N', 'NO', 'DENY', 'REJECT', 'CANCEL'].includes(upper)) {
            const mostRecent = this.getMostRecentPendingTask();
            if (mostRecent) {
                return { taskId: mostRecent.id, approved: false };
            }
        }

        // Task ID specific: "A" or "Y A" or "N B"
        if (parts.length === 1 && parts[0].length === 1 && parts[0] >= 'A' && parts[0] <= 'Z') {
            return { taskId: parts[0], approved: true };
        }

        if (parts.length >= 2) {
            const first = parts[0];
            const second = parts[1];

            if (['Y', 'YES', 'APPROVE'].includes(first) && second.length === 1) {
                return { taskId: second, approved: true };
            }
            if (['N', 'NO', 'DENY'].includes(first) && second.length === 1) {
                return { taskId: second, approved: false };
            }
        }

        return null;
    }

    private getMostRecentPendingTask(): TaskRequest | null {
        const pending = Array.from(this.pendingTasks.values());
        if (pending.length === 0) return null;
        return pending[pending.length - 1].task;
    }

    private async handleTaskResponse(
        response: { taskId: string; approved: boolean },
        user: HmanUser
    ): Promise<void> {
        const pending = this.pendingTasks.get(response.taskId);

        if (!pending) {
            await this.sendToUser(user.phoneNumber,
                `⚠️ No pending request "${response.taskId}". It may have expired.`
            );
            return;
        }

        // Clear timeout
        if (pending.timer) clearTimeout(pending.timer);
        this.pendingTasks.delete(response.taskId);

        const taskResponse: TaskResponse = {
            approved: response.approved,
            respondedAt: new Date(),
            respondedVia: 'signal',
        };

        pending.task.response = taskResponse;

        if (response.approved) {
            this.emit('task:approved', pending.task);

            // Execute if it's an execution task
            if (pending.task.type === 'execution' || pending.task.type === 'handoff') {
                await this.sendToUser(user.phoneNumber,
                    `✅ Approved! Executing: ${pending.task.action.description}...`
                );

                const result = await this.executeTask(pending.task);
                taskResponse.executionResult = result;

                if (result.success) {
                    await this.sendToUser(user.phoneNumber,
                        `✅ Done: ${pending.task.action.description}

${result.confirmationId ? `Confirmation: ${result.confirmationId}` : ''}
${result.result ? `Result: ${JSON.stringify(result.result)}` : ''}`
                    );
                } else {
                    await this.sendToUser(user.phoneNumber,
                        `❌ Failed: ${pending.task.action.description}

Error: ${result.error}`
                    );
                }
            } else {
                await this.sendToUser(user.phoneNumber,
                    `✅ Approved: ${pending.task.action.description}

${pending.task.llm.name} now has access.`
                );
            }
        } else {
            this.emit('task:denied', pending.task);
            await this.sendToUser(user.phoneNumber,
                `🚫 Denied: ${pending.task.action.description}

${pending.task.llm.name} was denied access.`
            );
        }

        pending.resolve(taskResponse);
    }

    // ========== Message Formatting ==========

    private async sendTaskRequest(phoneNumber: string, task: TaskRequest): Promise<void> {
        const icon = task.type === 'execution' ? '⚡' :
            task.type === 'handoff' ? '🤝' : '🔐';

        let message = `${icon} Request [${task.id}]

🤖 ${task.llm.name}
📋 ${task.action.description}
`;

        // Add details for execution tasks
        if (task.type === 'execution' || task.type === 'handoff') {
            const details = task.action.details;
            if (details.amount) {
                message += `💰 Amount: ${details.amount}\n`;
            }
            if (details.recipient) {
                message += `📤 To: ${details.recipient}\n`;
            }
        }

        message += `
━━━━━━━━━━━━━━━━━━━━━

Reply Y to approve, N to deny`;

        await this.sendToUser(phoneNumber, message);
    }

    private async sendHelp(phoneNumber: string): Promise<void> {
        await this.sendToUser(phoneNumber,
            `📖 HMAN Commands

📊 STATUS - See connected AIs & pending requests
⚙️ SETTINGS - Manage your preferences
📋 HISTORY - Recent activity

Responding to requests:
• Y or YES - Approve
• N or NO - Deny
• A, B, C - Approve specific request
• N A - Deny request A

Connected AIs can request:
• 🔐 Data access (calendar, contacts, etc.)
• ⚡ Execute tasks (pay bills, book appointments)
• 🤝 Handoff tasks (complex tasks you review)`
        );
    }

    private async sendStatus(user: HmanUser): Promise<void> {
        const pending = Array.from(this.pendingTasks.values())
            .filter(p => p.task.userId === user.id);

        let message = `📊 Your HMAN Status

👤 ${user.displayName || user.phoneNumber}
📱 ${user.phoneNumber}

🤖 Connected AIs (${user.connectedLLMs.length}):
${user.connectedLLMs.map(l => `• ${l.name} (${l.provider})`).join('\n') || '• None yet'}

`;

        if (pending.length > 0) {
            message += `\n⏳ Pending Requests (${pending.length}):\n`;
            message += pending.map(p =>
                `[${p.task.id}] ${p.task.llm.name}: ${p.task.action.description}`
            ).join('\n');
        } else {
            message += `\n✅ No pending requests`;
        }

        await this.sendToUser(user.phoneNumber, message);
    }

    private async sendSettings(user: HmanUser): Promise<void> {
        await this.sendToUser(user.phoneNumber,
            `⚙️ Your Settings

🔔 Notify on access: ${user.preferences.notifyOnAccess ? 'Yes' : 'No'}
🔔 Notify on execution: ${user.preferences.notifyOnExecution ? 'Yes' : 'No'}
⏱️ Approval timeout: ${user.preferences.defaultApprovalTimeout / 60000} minutes

(Settings management coming soon)`
        );
    }

    // ========== Utility ==========

    private async sendToUser(phoneNumber: string, message: string): Promise<void> {
        await this.signal.sendMessage(phoneNumber, message);
    }
}

// ========== Task Executor Interface ==========

export interface TaskExecutor {
    execute(task: TaskRequest): Promise<unknown>;
}

// ========== Example Executors ==========

export class PaymentExecutor implements TaskExecutor {
    async execute(task: TaskRequest): Promise<unknown> {
        // In production, this would integrate with PayID, bank APIs, etc.
        const { amount, recipient, reference } = task.action.details;

        console.log(`[Payment] Executing: $${amount} to ${recipient}`);

        // Simulate payment
        await new Promise(r => setTimeout(r, 2000));

        return {
            transactionId: `TXN-${Date.now()}`,
            amount,
            recipient,
            status: 'completed',
        };
    }
}

export class BookingExecutor implements TaskExecutor {
    async execute(task: TaskRequest): Promise<unknown> {
        const { service, datetime, notes } = task.action.details;

        console.log(`[Booking] Executing: ${service} at ${datetime}`);

        // Simulate booking
        await new Promise(r => setTimeout(r, 1500));

        return {
            bookingId: `BK-${Date.now()}`,
            service,
            datetime,
            confirmed: true,
        };
    }
}

// ========== Factory ==========

export async function createHmanService(hmanNumber: string): Promise<HmanService> {
    const service = new HmanService(hmanNumber);

    // Register default executors
    service.registerExecutor('payment', new PaymentExecutor());
    service.registerExecutor('booking', new BookingExecutor());

    await service.start();
    return service;
}
