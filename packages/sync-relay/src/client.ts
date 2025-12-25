/**
 * HMAN Sync Client
 *
 * Client library for connecting to the sync relay from devices.
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export interface SyncClientConfig {
  /** Relay server URL */
  relayUrl: string;
  /** User hash (derived from identity key) */
  userHash: string;
  /** Device ID (persistent per device) */
  deviceId: string;
  /** Reconnection settings */
  reconnect?: {
    enabled: boolean;
    maxAttempts: number;
    baseDelay: number;
  };
}

export interface SyncMessage {
  type: 'sync' | 'ack' | 'request' | 'response' | 'ping' | 'pong';
  id: string;
  deviceId: string;
  targetDeviceId?: string;
  userHash: string;
  payload?: string;
  timestamp: number;
  sequence?: number;
}

export type SyncEventHandler = (message: SyncMessage) => void;
export type ConnectionHandler = () => void;
export type ErrorHandler = (error: Error) => void;

/**
 * Sync Client - connects to the relay server
 */
export class SyncClient {
  private ws: WebSocket | null = null;
  private config: Required<SyncClientConfig>;
  private sequence = 0;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private pendingAcks: Map<string, { resolve: () => void; reject: (error: Error) => void }> = new Map();

  private onMessageHandlers: SyncEventHandler[] = [];
  private onConnectHandlers: ConnectionHandler[] = [];
  private onDisconnectHandlers: ConnectionHandler[] = [];
  private onErrorHandlers: ErrorHandler[] = [];

  constructor(config: SyncClientConfig) {
    this.config = {
      ...config,
      reconnect: config.reconnect ?? {
        enabled: true,
        maxAttempts: 10,
        baseDelay: 1000,
      },
    };
  }

  /**
   * Connect to the relay server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.relayUrl);

        this.ws.on('open', () => {
          console.log('Connected to HMAN Sync Relay');
          this.reconnectAttempts = 0;
          this.onConnectHandlers.forEach(handler => handler());
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as SyncMessage;
            this.handleMessage(message);
          } catch (error) {
            console.error('Error parsing message:', error);
          }
        });

        this.ws.on('close', () => {
          console.log('Disconnected from HMAN Sync Relay');
          this.onDisconnectHandlers.forEach(handler => handler());
          this.maybeReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.onErrorHandlers.forEach(handler => handler(error));
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the relay
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.config.reconnect.enabled = false;

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
  }

  /**
   * Send encrypted data to other devices
   */
  async sendSync(encryptedPayload: string, targetDeviceId?: string): Promise<void> {
    return this.sendMessage({
      type: 'sync',
      payload: encryptedPayload,
      targetDeviceId,
    });
  }

  /**
   * Request sync from another device
   */
  async requestSync(targetDeviceId?: string): Promise<void> {
    return this.sendMessage({
      type: 'request',
      targetDeviceId,
    });
  }

  /**
   * Send a message and wait for ack
   */
  private sendMessage(params: Partial<SyncMessage>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to relay'));
        return;
      }

      const message: SyncMessage = {
        type: params.type ?? 'sync',
        id: uuidv4(),
        deviceId: this.config.deviceId,
        targetDeviceId: params.targetDeviceId,
        userHash: this.config.userHash,
        payload: params.payload,
        timestamp: Date.now(),
        sequence: this.sequence++,
      };

      // Set up ack handler with timeout
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(message.id);
        reject(new Error('Sync message timed out'));
      }, 10000);

      this.pendingAcks.set(message.id, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(message: SyncMessage): void {
    switch (message.type) {
      case 'ack':
        const pending = this.pendingAcks.get(message.id);
        if (pending) {
          pending.resolve();
          this.pendingAcks.delete(message.id);
        }
        break;

      case 'sync':
      case 'request':
        this.onMessageHandlers.forEach(handler => handler(message));
        break;

      case 'ping':
        this.send({
          type: 'pong',
          id: message.id,
          deviceId: this.config.deviceId,
          userHash: this.config.userHash,
          timestamp: Date.now(),
        });
        break;

      case 'response':
        // Handle server responses
        if (message.payload) {
          try {
            const data = JSON.parse(Buffer.from(message.payload, 'base64').toString());
            if (data.error) {
              console.error('Server error:', data.error);
            }
          } catch {
            // Ignore parse errors
          }
        }
        break;
    }
  }

  /**
   * Send a raw message
   */
  private send(message: SyncMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Attempt reconnection
   */
  private maybeReconnect(): void {
    if (!this.config.reconnect.enabled) return;
    if (this.reconnectAttempts >= this.config.reconnect.maxAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = this.config.reconnect.baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.reconnect.maxAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  /**
   * Register message handler
   */
  onMessage(handler: SyncEventHandler): void {
    this.onMessageHandlers.push(handler);
  }

  /**
   * Register connect handler
   */
  onConnect(handler: ConnectionHandler): void {
    this.onConnectHandlers.push(handler);
  }

  /**
   * Register disconnect handler
   */
  onDisconnect(handler: ConnectionHandler): void {
    this.onDisconnectHandlers.push(handler);
  }

  /**
   * Register error handler
   */
  onError(handler: ErrorHandler): void {
    this.onErrorHandlers.push(handler);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get device ID
   */
  getDeviceId(): string {
    return this.config.deviceId;
  }
}

/**
 * Create a sync client with a generated device ID
 */
export function createSyncClient(relayUrl: string, userHash: string): SyncClient {
  return new SyncClient({
    relayUrl,
    userHash,
    deviceId: uuidv4(),
  });
}
