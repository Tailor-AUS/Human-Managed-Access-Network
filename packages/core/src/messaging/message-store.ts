/**
 * Message Store - Local storage for E2EE messages
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  MessageType,
  MessageParticipant,
  Conversation,
  DecryptedMessageContent,
} from '@hman/shared';
import {
  SessionManager,
  type EncryptedMessage,
} from './crypto.js';

export interface StoredMessage {
  id: string;
  conversationId: string;
  senderId: string;
  recipientId: string;
  type: MessageType;
  encryptedContent: EncryptedMessage;
  sentAt: Date;
  receivedAt?: Date;
  readAt?: Date;
  replyTo?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
}

export interface MessageStoreConfig {
  sessionManager: SessionManager;
}

/**
 * Message Store - manages encrypted messages
 */
export class MessageStore {
  private sessionManager: SessionManager;
  private messages: Map<string, StoredMessage> = new Map();
  private conversations: Map<string, Conversation> = new Map();
  private messagesByConversation: Map<string, string[]> = new Map();

  constructor(config: MessageStoreConfig) {
    this.sessionManager = config.sessionManager;
  }

  /**
   * Create a new conversation
   */
  createConversation(
    participant: MessageParticipant,
    type: 'direct' | 'bot' = 'direct'
  ): Conversation {
    const id = uuidv4();
    const ourPublicKey = this.sessionManager.getPublicIdentityKey();

    const conversation: Conversation = {
      id,
      participants: [
        {
          type: 'user',
          id: 'self',
          displayName: 'You',
          handle: '@me.hman',
          publicKey: ourPublicKey,
        },
        participant,
      ],
      type,
      unreadCount: 0,
      muted: false,
      archived: false,
    };

    this.conversations.set(id, conversation);
    this.messagesByConversation.set(id, []);

    return conversation;
  }

  /**
   * Get or create a conversation with a participant
   */
  getOrCreateConversation(participant: MessageParticipant): Conversation {
    // Check if conversation exists
    for (const conv of this.conversations.values()) {
      const hasParticipant = conv.participants.some(p => p.id === participant.id);
      if (hasParticipant && conv.type === 'direct') {
        return conv;
      }
    }

    // Create new conversation
    return this.createConversation(participant);
  }

  /**
   * Send a message
   */
  async sendMessage(
    conversationId: string,
    content: DecryptedMessageContent,
    replyTo?: string
  ): Promise<StoredMessage> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const recipient = conversation.participants.find(p => p.id !== 'self');
    if (!recipient) {
      throw new Error('No recipient found');
    }

    // Encrypt the message
    const plaintext = JSON.stringify(content);
    const encryptedContent = this.sessionManager.encryptForContact(
      recipient.id,
      recipient.publicKey,
      plaintext
    );

    const message: StoredMessage = {
      id: uuidv4(),
      conversationId,
      senderId: 'self',
      recipientId: recipient.id,
      type: content.type as MessageType,
      encryptedContent,
      sentAt: new Date(),
      replyTo,
      status: 'sent',
    };

    // Store the message
    this.messages.set(message.id, message);
    const conversationMessages = this.messagesByConversation.get(conversationId) ?? [];
    conversationMessages.push(message.id);
    this.messagesByConversation.set(conversationId, conversationMessages);

    // Update conversation
    conversation.lastMessageAt = message.sentAt;

    return message;
  }

  /**
   * Receive a message
   */
  async receiveMessage(
    conversationId: string,
    senderId: string,
    senderPublicKey: string,
    encryptedContent: EncryptedMessage,
    sentAt: Date
  ): Promise<{ message: StoredMessage; content: DecryptedMessageContent }> {
    // Decrypt the message
    const plaintext = this.sessionManager.decryptFromContact(
      senderId,
      senderPublicKey,
      encryptedContent
    );
    const content = JSON.parse(plaintext) as DecryptedMessageContent;

    const message: StoredMessage = {
      id: uuidv4(),
      conversationId,
      senderId,
      recipientId: 'self',
      type: content.type as MessageType,
      encryptedContent,
      sentAt,
      receivedAt: new Date(),
      status: 'delivered',
    };

    // Store the message
    this.messages.set(message.id, message);
    const conversationMessages = this.messagesByConversation.get(conversationId) ?? [];
    conversationMessages.push(message.id);
    this.messagesByConversation.set(conversationId, conversationMessages);

    // Update conversation
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.lastMessageAt = message.receivedAt;
      conversation.unreadCount++;
    }

    return { message, content };
  }

  /**
   * Decrypt a stored message
   */
  decryptMessage(
    messageId: string,
    senderPublicKey: string
  ): DecryptedMessageContent {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    const plaintext = this.sessionManager.decryptFromContact(
      message.senderId,
      senderPublicKey,
      message.encryptedContent
    );

    return JSON.parse(plaintext) as DecryptedMessageContent;
  }

  /**
   * Get messages for a conversation
   */
  getConversationMessages(conversationId: string): StoredMessage[] {
    const messageIds = this.messagesByConversation.get(conversationId) ?? [];
    return messageIds
      .map(id => this.messages.get(id))
      .filter((m): m is StoredMessage => m !== undefined)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
  }

  /**
   * Get all conversations
   */
  getConversations(): Conversation[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => {
        const aTime = a.lastMessageAt?.getTime() ?? 0;
        const bTime = b.lastMessageAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  /**
   * Mark messages as read
   */
  markAsRead(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.unreadCount = 0;
    }

    const messageIds = this.messagesByConversation.get(conversationId) ?? [];
    for (const id of messageIds) {
      const message = this.messages.get(id);
      if (message && message.recipientId === 'self' && !message.readAt) {
        message.readAt = new Date();
        message.status = 'read';
      }
    }
  }

  /**
   * Delete a message locally
   */
  deleteMessage(messageId: string): boolean {
    return this.messages.delete(messageId);
  }

  /**
   * Archive a conversation
   */
  archiveConversation(conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.archived = true;
    }
  }

  /**
   * Mute a conversation
   */
  muteConversation(conversationId: string, muted: boolean): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation) {
      conversation.muted = muted;
    }
  }
}
