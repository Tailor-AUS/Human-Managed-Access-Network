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
