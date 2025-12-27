export {
  generateIdentityKeyPair,
  generatePreKey,
  generatePreKeys,
  encryptMessage,
  decryptMessage,
  SessionManager,
  createSessionManager,
  restoreSessionManager,
  type IdentityKeyPair,
  type PreKey,
  type SignedPreKey,
  type EncryptedMessage,
  type Session,
} from './crypto.js';

export {
  MessageStore,
  type MessageStoreConfig,
  type StoredMessage,
} from './message-store.js';

// Signal integration
export {
  SignalService,
  createSignalService,
  HmanSignalBridge,
  type SignalMessage,
  type SignalAttachment,
  type SignalConfig,
  type SignalRegistration,
} from './signal.js';

// Signal CLI Interface - Complete HMAN control via Signal
export {
  HmanSignalInterface,
  createSignalInterface,
  type HmanCommand,
  type ParsedCommand,
  type HmanStatus,
  type PendingRequest,
  type VaultSummary,
  type ActivityEntry,
} from './signal-cli-interface.js';

// Signal Profile Builder
export {
  SignalProfileBuilder,
  createProfileBuilder,
  type HmanProfile,
  type ProfileItem,
} from './signal-profile-builder.js';

// Note-to-Self Manager - Uses Signal as the data store
export {
  NoteToSelfManager,
  createNoteToSelfManager,
  type NoteToSelfProfile,
  type NoteToSelfItem,
  type AccessLogEntry,
} from './note-to-self.js';

// .hman Protocol - Signal-to-LLM Access Control Bridge
export {
  HmanProtocol,
  createHmanProtocol,
  type LLMAccessRequest,
  type AccessDecision,
  type DataRelease,
} from './hman-protocol.js';
