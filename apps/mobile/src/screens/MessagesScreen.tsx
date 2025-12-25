/**
 * Messages Screen - E2EE messaging with bots and contacts
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/theme';

interface MessagesScreenProps {
  onBack: () => void;
}

interface Conversation {
  id: string;
  name: string;
  type: 'bot' | 'contact' | 'delegate';
  lastMessage: string;
  timestamp: Date;
  unreadCount: number;
  avatar?: string;
  verified: boolean;
}

interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'payment_request' | 'action_required';
  status: 'sent' | 'delivered' | 'read';
}

const mockConversations: Conversation[] = [
  {
    id: '1',
    name: 'Energy Australia',
    type: 'bot',
    lastMessage: 'Your electricity bill of $142.50 is due in 5 days',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    unreadCount: 1,
    verified: true,
  },
  {
    id: '2',
    name: 'Commonwealth Bank',
    type: 'bot',
    lastMessage: 'Transaction alert: $89.00 at Woolworths',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    unreadCount: 0,
    verified: true,
  },
  {
    id: '3',
    name: 'Medicare',
    type: 'bot',
    lastMessage: 'Your prescription is ready for refill',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    unreadCount: 0,
    verified: true,
  },
  {
    id: '4',
    name: 'Sarah Johnson',
    type: 'delegate',
    lastMessage: 'I approved the access request for your tax documents',
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    unreadCount: 0,
    verified: false,
  },
];

const mockMessages: Message[] = [
  {
    id: '1',
    senderId: 'bot',
    content: 'Hello! Welcome to Energy Australia messaging.',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    type: 'text',
    status: 'read',
  },
  {
    id: '2',
    senderId: 'user',
    content: 'Hi, I have a question about my last bill',
    timestamp: new Date(Date.now() - 23 * 60 * 60 * 1000),
    type: 'text',
    status: 'read',
  },
  {
    id: '3',
    senderId: 'bot',
    content: 'Of course! I can help with that. Your last bill was for $142.50 covering the period of Nov 1 - Nov 30.',
    timestamp: new Date(Date.now() - 22 * 60 * 60 * 1000),
    type: 'text',
    status: 'read',
  },
  {
    id: '4',
    senderId: 'bot',
    content: 'Your electricity bill of $142.50 is due in 5 days',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    type: 'payment_request',
    status: 'delivered',
  },
];

function formatTime(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function getTypeIcon(type: Conversation['type']): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'bot': return 'hardware-chip-outline';
    case 'contact': return 'person-outline';
    case 'delegate': return 'people-outline';
    default: return 'chatbubble-outline';
  }
}

function getTypeColor(type: Conversation['type']): string {
  switch (type) {
    case 'bot': return colors.info;
    case 'contact': return colors.primary;
    case 'delegate': return colors.levelGated;
    default: return colors.textMuted;
  }
}

export function MessagesScreen({ onBack }: MessagesScreenProps) {
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [messages] = useState<Message[]>(mockMessages);

  const handleSend = () => {
    if (messageText.trim()) {
      console.log('Send message:', messageText);
      setMessageText('');
    }
  };

  if (selectedConversation) {
    return (
      <SafeAreaView style={styles.container}>
        {/* Chat Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => setSelectedConversation(null)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <View style={styles.chatHeaderRow}>
              <Text style={styles.chatHeaderName}>{selectedConversation.name}</Text>
              {selectedConversation.verified && (
                <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              )}
            </View>
            <Text style={styles.chatHeaderType}>
              {selectedConversation.type === 'bot' ? 'Verified Service' : 'Delegate'}
            </Text>
          </View>
          <TouchableOpacity style={styles.infoButton}>
            <Ionicons name="information-circle-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.chatContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={100}
        >
          {/* Messages */}
          <ScrollView
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.senderId === 'user' ? styles.userMessage : styles.otherMessage,
                ]}
              >
                {message.type === 'payment_request' && (
                  <View style={styles.paymentRequest}>
                    <Ionicons name="card-outline" size={20} color={colors.levelGated} />
                    <Text style={styles.paymentLabel}>Payment Request</Text>
                  </View>
                )}
                <Text style={[
                  styles.messageText,
                  message.senderId === 'user' && styles.userMessageText,
                ]}>
                  {message.content}
                </Text>
                <View style={styles.messageFooter}>
                  <Text style={styles.messageTime}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {message.senderId === 'user' && (
                    <Ionicons
                      name={message.status === 'read' ? 'checkmark-done' : 'checkmark'}
                      size={14}
                      color={message.status === 'read' ? colors.info : colors.textMuted}
                    />
                  )}
                </View>
                {message.type === 'payment_request' && (
                  <View style={styles.paymentActions}>
                    <TouchableOpacity style={styles.payButton}>
                      <Text style={styles.payButtonText}>Pay $142.50</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.viewDetailsButton}>
                      <Text style={styles.viewDetailsText}>View Details</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Message Input */}
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachButton}>
              <Ionicons name="attach-outline" size={24} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.messageInput}
              value={messageText}
              onChangeText={setMessageText}
              placeholder="Type a message..."
              placeholderTextColor={colors.textMuted}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!messageText.trim()}
            >
              <Ionicons name="send" size={20} color={messageText.trim() ? colors.textPrimary : colors.textMuted} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity style={styles.composeButton}>
          <Ionicons name="create-outline" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* E2EE Notice */}
      <View style={styles.e2eeNotice}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
        <Text style={styles.e2eeText}>All messages are end-to-end encrypted</Text>
      </View>

      {/* Conversations List */}
      <ScrollView style={styles.conversationsList} showsVerticalScrollIndicator={false}>
        {mockConversations.map((conversation) => (
          <TouchableOpacity
            key={conversation.id}
            style={styles.conversationItem}
            onPress={() => setSelectedConversation(conversation)}
          >
            <View style={[styles.avatar, { backgroundColor: getTypeColor(conversation.type) + '20' }]}>
              <Ionicons name={getTypeIcon(conversation.type)} size={24} color={getTypeColor(conversation.type)} />
            </View>
            <View style={styles.conversationContent}>
              <View style={styles.conversationHeader}>
                <View style={styles.nameRow}>
                  <Text style={styles.conversationName}>{conversation.name}</Text>
                  {conversation.verified && (
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                  )}
                </View>
                <Text style={styles.conversationTime}>{formatTime(conversation.timestamp)}</Text>
              </View>
              <View style={styles.conversationFooter}>
                <Text
                  style={[styles.lastMessage, conversation.unreadCount > 0 && styles.unreadMessage]}
                  numberOfLines={1}
                >
                  {conversation.lastMessage}
                </Text>
                {conversation.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadCount}>{conversation.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: typography.fontSizes.xl,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  composeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  e2eeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: colors.success + '10',
    gap: spacing.xs,
  },
  e2eeText: {
    fontSize: typography.fontSizes.xs,
    color: colors.success,
  },
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  conversationName: {
    fontSize: typography.fontSizes.md,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  conversationTime: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    flex: 1,
    fontSize: typography.fontSizes.sm,
    color: colors.textMuted,
  },
  unreadMessage: {
    color: colors.textPrimary,
    fontWeight: typography.fontWeights.medium,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginLeft: spacing.sm,
  },
  unreadCount: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.bold,
    color: colors.textPrimary,
  },
  // Chat view styles
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chatHeaderInfo: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  chatHeaderName: {
    fontSize: typography.fontSizes.lg,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  chatHeaderType: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  infoButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.md,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
  },
  messageText: {
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
  },
  userMessageText: {
    color: '#ffffff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  messageTime: {
    fontSize: typography.fontSizes.xs,
    color: colors.textMuted,
  },
  paymentRequest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paymentLabel: {
    fontSize: typography.fontSizes.xs,
    fontWeight: typography.fontWeights.semibold,
    color: colors.levelGated,
  },
  paymentActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  payButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.semibold,
    color: colors.textPrimary,
  },
  viewDetailsButton: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  viewDetailsText: {
    fontSize: typography.fontSizes.sm,
    fontWeight: typography.fontWeights.medium,
    color: colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  attachButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.fontSizes.md,
    color: colors.textPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.surface,
  },
});
