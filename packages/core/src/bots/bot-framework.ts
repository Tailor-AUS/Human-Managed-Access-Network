/**
 * HMAN Bot Framework
 *
 * Enables third-party services (utilities, banks, etc.) to send
 * structured messages and payment requests through E2EE channels.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  BotInfo,
  PaymentRequestContent,
  StructuredMessageContent,
  MessageAction,
} from '@hman/shared';

export interface BotRegistration {
  /** Bot identifier */
  id: string;
  /** Bot information */
  info: BotInfo;
  /** Bot's public key for E2EE */
  publicKey: string;
  /** Allowed message types */
  allowedMessageTypes: string[];
  /** Allowed data categories the bot can request */
  allowedDataCategories: string[];
  /** Registration timestamp */
  registeredAt: Date;
  /** Last active timestamp */
  lastActiveAt: Date;
  /** Whether the bot is enabled */
  enabled: boolean;
}

export interface BotMessage {
  /** Message ID */
  id: string;
  /** Bot that sent the message */
  botId: string;
  /** Message type */
  type: 'payment_request' | 'notification' | 'action_required' | 'info';
  /** Message content */
  content: PaymentRequestContent | StructuredMessageContent;
  /** When the message was sent */
  sentAt: Date;
  /** When the message expires (for actions) */
  expiresAt?: Date;
  /** User's response */
  response?: BotMessageResponse;
}

export interface BotMessageResponse {
  /** Selected action ID */
  actionId: string;
  /** Response data */
  data?: Record<string, unknown>;
  /** When responded */
  respondedAt: Date;
}

export interface BotStorage {
  saveBot(bot: BotRegistration): Promise<void>;
  getBot(botId: string): Promise<BotRegistration | null>;
  getAllBots(): Promise<BotRegistration[]>;
  getEnabledBots(): Promise<BotRegistration[]>;
  deleteBot(botId: string): Promise<void>;
  saveMessage(message: BotMessage): Promise<void>;
  getMessage(messageId: string): Promise<BotMessage | null>;
  getMessagesByBot(botId: string): Promise<BotMessage[]>;
  getPendingMessages(): Promise<BotMessage[]>;
}

/**
 * Bot Manager - handles bot registrations and messages
 */
export class BotManager {
  private storage: BotStorage;

  constructor(storage: BotStorage) {
    this.storage = storage;
  }

  /**
   * Register a new bot
   */
  async registerBot(info: BotInfo, publicKey: string, options?: {
    allowedMessageTypes?: string[];
    allowedDataCategories?: string[];
  }): Promise<BotRegistration> {
    const bot: BotRegistration = {
      id: info.id,
      info,
      publicKey,
      allowedMessageTypes: options?.allowedMessageTypes ?? ['notification', 'info'],
      allowedDataCategories: options?.allowedDataCategories ?? [],
      registeredAt: new Date(),
      lastActiveAt: new Date(),
      enabled: true,
    };

    await this.storage.saveBot(bot);
    return bot;
  }

  /**
   * Get a registered bot
   */
  async getBot(botId: string): Promise<BotRegistration | null> {
    return this.storage.getBot(botId);
  }

  /**
   * Get all registered bots
   */
  async getAllBots(): Promise<BotRegistration[]> {
    return this.storage.getAllBots();
  }

  /**
   * Enable/disable a bot
   */
  async setBotEnabled(botId: string, enabled: boolean): Promise<void> {
    const bot = await this.storage.getBot(botId);
    if (!bot) throw new Error('Bot not found');

    bot.enabled = enabled;
    await this.storage.saveBot(bot);
  }

  /**
   * Unregister a bot
   */
  async unregisterBot(botId: string): Promise<void> {
    await this.storage.deleteBot(botId);
  }

  /**
   * Process an incoming bot message
   */
  async receiveMessage(
    botId: string,
    type: BotMessage['type'],
    content: PaymentRequestContent | StructuredMessageContent,
    expiresAt?: Date
  ): Promise<BotMessage> {
    const bot = await this.storage.getBot(botId);
    if (!bot) throw new Error('Bot not registered');
    if (!bot.enabled) throw new Error('Bot is disabled');

    // Check if message type is allowed
    if (!bot.allowedMessageTypes.includes(type)) {
      throw new Error(`Message type '${type}' not allowed for this bot`);
    }

    const message: BotMessage = {
      id: uuidv4(),
      botId,
      type,
      content,
      sentAt: new Date(),
      expiresAt,
    };

    await this.storage.saveMessage(message);

    // Update bot's last active timestamp
    bot.lastActiveAt = new Date();
    await this.storage.saveBot(bot);

    return message;
  }

  /**
   * Respond to a bot message
   */
  async respondToMessage(
    messageId: string,
    actionId: string,
    data?: Record<string, unknown>
  ): Promise<BotMessage> {
    const message = await this.storage.getMessage(messageId);
    if (!message) throw new Error('Message not found');

    if (message.response) {
      throw new Error('Message already responded to');
    }

    if (message.expiresAt && message.expiresAt < new Date()) {
      throw new Error('Message has expired');
    }

    message.response = {
      actionId,
      data,
      respondedAt: new Date(),
    };

    await this.storage.saveMessage(message);
    return message;
  }

  /**
   * Get pending messages (not yet responded)
   */
  async getPendingMessages(): Promise<BotMessage[]> {
    return this.storage.getPendingMessages();
  }

  /**
   * Get messages from a specific bot
   */
  async getBotMessages(botId: string): Promise<BotMessage[]> {
    return this.storage.getMessagesByBot(botId);
  }
}

/**
 * In-memory bot storage for testing
 */
export class MemoryBotStorage implements BotStorage {
  private bots: Map<string, BotRegistration> = new Map();
  private messages: Map<string, BotMessage> = new Map();

  async saveBot(bot: BotRegistration): Promise<void> {
    this.bots.set(bot.id, { ...bot });
  }

  async getBot(botId: string): Promise<BotRegistration | null> {
    return this.bots.get(botId) ?? null;
  }

  async getAllBots(): Promise<BotRegistration[]> {
    return Array.from(this.bots.values());
  }

  async getEnabledBots(): Promise<BotRegistration[]> {
    return Array.from(this.bots.values()).filter(b => b.enabled);
  }

  async deleteBot(botId: string): Promise<void> {
    this.bots.delete(botId);
  }

  async saveMessage(message: BotMessage): Promise<void> {
    this.messages.set(message.id, { ...message });
  }

  async getMessage(messageId: string): Promise<BotMessage | null> {
    return this.messages.get(messageId) ?? null;
  }

  async getMessagesByBot(botId: string): Promise<BotMessage[]> {
    return Array.from(this.messages.values())
      .filter(m => m.botId === botId)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  async getPendingMessages(): Promise<BotMessage[]> {
    const now = new Date();
    return Array.from(this.messages.values())
      .filter(m => !m.response && (!m.expiresAt || m.expiresAt > now))
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
  }

  clear(): void {
    this.bots.clear();
    this.messages.clear();
  }
}

/**
 * Helper to create a payment request message
 */
export function createPaymentRequestMessage(params: {
  paymentRequestId: string;
  payeeName: string;
  payeePayId: string;
  amount: number;
  currency?: string;
  reference: string;
  dueDate?: string;
  invoiceNumber?: string;
  category?: string;
  breakdown?: Array<{ description: string; amount: number }>;
}): PaymentRequestContent {
  return {
    type: 'payment_request',
    paymentRequestId: params.paymentRequestId,
    payee: {
      name: params.payeeName,
      payId: params.payeePayId,
    },
    amount: params.amount,
    currency: params.currency ?? 'AUD',
    reference: params.reference,
    dueDate: params.dueDate,
    invoiceNumber: params.invoiceNumber,
    category: params.category,
    breakdown: params.breakdown,
  };
}

/**
 * Helper to create a structured message with actions
 */
export function createStructuredMessage(params: {
  summary: string;
  data: Record<string, unknown>;
  actions?: MessageAction[];
}): StructuredMessageContent {
  return {
    type: 'structured',
    summary: params.summary,
    data: params.data,
    actions: params.actions,
  };
}

/**
 * Pre-defined bot templates
 */
export const BOT_TEMPLATES = {
  utilityProvider: (name: string, id: string) => ({
    id,
    name,
    organization: name,
    description: `${name} utility bill notifications and payment requests`,
    dataCategories: ['billing', 'usage'],
    verified: false,
  }),

  bank: (name: string, id: string) => ({
    id,
    name,
    organization: name,
    description: `${name} account notifications and alerts`,
    dataCategories: ['transactions', 'balances'],
    verified: false,
  }),

  healthProvider: (name: string, id: string) => ({
    id,
    name,
    organization: name,
    description: `${name} appointment reminders and health updates`,
    dataCategories: ['appointments', 'prescriptions'],
    verified: false,
  }),
};
