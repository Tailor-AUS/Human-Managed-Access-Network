/**
 * E2EE Messaging Types
 */
export interface Message {
  /** Unique message identifier */
  id: string;
  /** Conversation/thread this belongs to */
  conversationId: string;
  /** Sender information */
  sender: MessageParticipant;
  /** Recipient information */
  recipient: MessageParticipant;
  /** Message type */
  type: MessageType;
  /** Encrypted content */
  encryptedContent: string;
  /** Encryption nonce */
  nonce: string;
  /** When sent */
  sentAt: Date;
  /** When received (null if not yet received) */
  receivedAt?: Date;
  /** When read (null if not yet read) */
  readAt?: Date;
  /** For replies, the parent message ID */
  replyTo?: string;
  /** Whether this message has been deleted locally */
  deletedLocally?: boolean;
}

export type MessageType =
  | 'text'
  | 'structured'
  | 'payment_request'
  | 'payment_confirmation'
  | 'delegation_invite'
  | 'delegation_response'
  | 'access_notification'
  | 'file';

export interface MessageParticipant {
  /** Participant type */
  type: 'user' | 'bot';
  /** HMAN user/bot ID */
  id: string;
  /** Display name */
  displayName: string;
  /** HMAN handle */
  handle: string;
  /** Public key for E2EE */
  publicKey: string;
}

/**
 * Decrypted message content types
 */
export interface TextMessageContent {
  type: 'text';
  text: string;
}

export interface StructuredMessageContent {
  type: 'structured';
  /** Human-readable summary */
  summary: string;
  /** Structured data for programmatic use */
  data: Record<string, unknown>;
  /** Action buttons/options */
  actions?: MessageAction[];
}

export interface PaymentRequestContent {
  type: 'payment_request';
  /** Unique payment request ID */
  paymentRequestId: string;
  /** Payee information */
  payee: {
    name: string;
    payId: string;
  };
  /** Amount details */
  amount: number;
  currency: string;
  /** Reference/description */
  reference: string;
  /** Due date */
  dueDate?: string;
  /** Invoice/bill details */
  invoiceNumber?: string;
  category?: string;
  /** Breakdown (for utility bills, etc.) */
  breakdown?: Array<{
    description: string;
    amount: number;
  }>;
  /** Historical comparison */
  previousPayments?: Array<{
    date: string;
    amount: number;
  }>;
}

export interface PaymentConfirmationContent {
  type: 'payment_confirmation';
  /** Original payment request ID */
  paymentRequestId: string;
  /** Transaction ID from payment provider */
  transactionId: string;
  /** Amount paid */
  amount: number;
  currency: string;
  /** When payment was made */
  paidAt: string;
  /** Status */
  status: 'completed' | 'pending' | 'failed';
}

export interface DelegationInviteContent {
  type: 'delegation_invite';
  /** Delegation details */
  delegationId: string;
  grantor: {
    id: string;
    displayName: string;
    handle: string;
  };
  /** What's being delegated */
  vaults: string[];
  permissions: string[];
  /** Expiry */
  expiresAt: string;
  /** Conditions */
  conditions?: string[];
}

export interface DelegationResponseContent {
  type: 'delegation_response';
  delegationId: string;
  accepted: boolean;
  respondedAt: string;
  reason?: string;
}

export interface AccessNotificationContent {
  type: 'access_notification';
  /** What was accessed */
  resource: string;
  /** Who accessed it */
  accessor: string;
  accessorType: 'ai_model' | 'delegate';
  /** When */
  accessedAt: string;
  /** Approval type */
  approvalType: 'auto' | 'user' | 'delegate';
  /** Brief summary of what was shared */
  dataSummary?: string;
}

export interface MessageAction {
  /** Action identifier */
  id: string;
  /** Display label */
  label: string;
  /** Action type */
  type: 'approve' | 'deny' | 'delegate' | 'query_ai' | 'view_details' | 'custom';
  /** Whether this is the primary/recommended action */
  primary?: boolean;
  /** Additional params for the action */
  params?: Record<string, unknown>;
}

export type DecryptedMessageContent =
  | TextMessageContent
  | StructuredMessageContent
  | PaymentRequestContent
  | PaymentConfirmationContent
  | DelegationInviteContent
  | DelegationResponseContent
  | AccessNotificationContent;

/**
 * Conversation/Thread
 */
export interface Conversation {
  /** Unique conversation ID */
  id: string;
  /** Participants */
  participants: MessageParticipant[];
  /** Conversation type */
  type: 'direct' | 'bot' | 'group';
  /** Display name (for groups/bots) */
  name?: string;
  /** Bot details (if applicable) */
  botInfo?: BotInfo;
  /** Last message timestamp */
  lastMessageAt?: Date;
  /** Unread message count */
  unreadCount: number;
  /** Is this conversation muted */
  muted: boolean;
  /** Is this conversation archived */
  archived: boolean;
}

export interface BotInfo {
  /** Bot identifier */
  id: string;
  /** Bot name */
  name: string;
  /** Organization that operates the bot */
  organization: string;
  /** Bot description */
  description: string;
  /** Categories of data the bot may request */
  dataCategories: string[];
  /** Whether the bot is verified */
  verified: boolean;
  /** Verification date */
  verifiedAt?: Date;
}
