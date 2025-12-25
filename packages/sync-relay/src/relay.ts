/**
 * HMAN Sync Relay
 *
 * Zero-knowledge relay server for syncing encrypted data between devices.
 * The relay never sees plaintext data - it only forwards encrypted blobs.
 */

import { WebSocket, WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import type { IncomingMessage } from 'http';

export interface RelayConfig {
  /** Port to listen on */
  port: number;
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Max clients per user */
  maxClientsPerUser?: number;
}

export interface SyncMessage {
  /** Message type */
  type: 'sync' | 'ack' | 'request' | 'response' | 'ping' | 'pong';
  /** Unique message ID */
  id: string;
  /** Sender device ID */
  deviceId: string;
  /** Target device ID (optional, for direct messages) */
  targetDeviceId?: string;
  /** User identifier (hashed) */
  userHash: string;
  /** Encrypted payload (base64) */
  payload?: string;
  /** Timestamp */
  timestamp: number;
  /** Sequence number for ordering */
  sequence?: number;
}

interface ConnectedClient {
  ws: WebSocket;
  deviceId: string;
  userHash: string;
  lastSeen: Date;
  sequence: number;
}

/**
 * Sync Relay Server
 */
export class SyncRelay {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private userDevices: Map<string, Set<string>> = new Map();
  private config: Required<RelayConfig>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(config: RelayConfig) {
    this.config = {
      port: config.port,
      maxMessageSize: config.maxMessageSize ?? 1024 * 1024, // 1MB default
      heartbeatInterval: config.heartbeatInterval ?? 30000, // 30s
      maxClientsPerUser: config.maxClientsPerUser ?? 10,
    };
  }

  /**
   * Start the relay server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          maxPayload: this.config.maxMessageSize,
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        this.wss.on('error', (error) => this.handleError(error));

        this.wss.on('listening', () => {
          console.log(`HMAN Sync Relay listening on port ${this.config.port}`);
          this.startHeartbeat();
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the relay server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }

      if (this.wss) {
        // Close all connections
        for (const client of this.clients.values()) {
          client.ws.close(1000, 'Server shutting down');
        }

        this.wss.close(() => {
          console.log('HMAN Sync Relay stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage): void {
    const deviceId = uuidv4();
    let userHash: string | null = null;

    console.log(`New connection from ${req.socket.remoteAddress}, assigned device ID: ${deviceId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as SyncMessage;
        this.handleMessage(ws, deviceId, message);

        // Track user association on first message
        if (!userHash && message.userHash) {
          userHash = message.userHash;
          this.registerClient(deviceId, userHash, ws);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', () => {
      console.log(`Connection closed: ${deviceId}`);
      this.unregisterClient(deviceId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${deviceId}:`, error);
    });

    // Send welcome message
    this.send(ws, {
      type: 'response',
      id: uuidv4(),
      deviceId: 'server',
      userHash: '',
      timestamp: Date.now(),
      payload: Buffer.from(JSON.stringify({ deviceId, message: 'Connected to HMAN Sync Relay' })).toString('base64'),
    });
  }

  /**
   * Register a client
   */
  private registerClient(deviceId: string, userHash: string, ws: WebSocket): void {
    // Check max clients per user
    const userDeviceSet = this.userDevices.get(userHash) ?? new Set();
    if (userDeviceSet.size >= this.config.maxClientsPerUser) {
      this.sendError(ws, 'Maximum devices reached');
      ws.close(1008, 'Maximum devices reached');
      return;
    }

    const client: ConnectedClient = {
      ws,
      deviceId,
      userHash,
      lastSeen: new Date(),
      sequence: 0,
    };

    this.clients.set(deviceId, client);
    userDeviceSet.add(deviceId);
    this.userDevices.set(userHash, userDeviceSet);

    console.log(`Registered device ${deviceId} for user ${userHash.substring(0, 8)}...`);

    // Notify other devices of new connection
    this.broadcastToUser(userHash, {
      type: 'sync',
      id: uuidv4(),
      deviceId: 'server',
      userHash,
      timestamp: Date.now(),
      payload: Buffer.from(JSON.stringify({
        event: 'device_connected',
        deviceId,
      })).toString('base64'),
    }, deviceId);
  }

  /**
   * Unregister a client
   */
  private unregisterClient(deviceId: string): void {
    const client = this.clients.get(deviceId);
    if (!client) return;

    const userDeviceSet = this.userDevices.get(client.userHash);
    if (userDeviceSet) {
      userDeviceSet.delete(deviceId);
      if (userDeviceSet.size === 0) {
        this.userDevices.delete(client.userHash);
      }
    }

    this.clients.delete(deviceId);

    // Notify other devices of disconnection
    if (client.userHash) {
      this.broadcastToUser(client.userHash, {
        type: 'sync',
        id: uuidv4(),
        deviceId: 'server',
        userHash: client.userHash,
        timestamp: Date.now(),
        payload: Buffer.from(JSON.stringify({
          event: 'device_disconnected',
          deviceId,
        })).toString('base64'),
      });
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(ws: WebSocket, deviceId: string, message: SyncMessage): void {
    const client = this.clients.get(deviceId);
    if (client) {
      client.lastSeen = new Date();
    }

    switch (message.type) {
      case 'sync':
        this.handleSync(deviceId, message);
        break;

      case 'request':
        this.handleRequest(deviceId, message);
        break;

      case 'ping':
        this.send(ws, {
          type: 'pong',
          id: message.id,
          deviceId: 'server',
          userHash: message.userHash,
          timestamp: Date.now(),
        });
        break;

      case 'ack':
        // Acknowledgment received, could update delivery status
        break;

      default:
        this.sendError(ws, `Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle sync message (broadcast to user's other devices)
   */
  private handleSync(senderDeviceId: string, message: SyncMessage): void {
    const sender = this.clients.get(senderDeviceId);
    if (!sender) return;

    if (message.targetDeviceId) {
      // Direct message to specific device
      const target = this.clients.get(message.targetDeviceId);
      if (target && target.userHash === sender.userHash) {
        this.send(target.ws, message);
      }
    } else {
      // Broadcast to all user's devices
      this.broadcastToUser(sender.userHash, message, senderDeviceId);
    }

    // Send ack to sender
    this.send(sender.ws, {
      type: 'ack',
      id: message.id,
      deviceId: 'server',
      userHash: message.userHash,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle sync request (request data from another device)
   */
  private handleRequest(senderDeviceId: string, message: SyncMessage): void {
    const sender = this.clients.get(senderDeviceId);
    if (!sender) return;

    // Forward request to target device or broadcast
    if (message.targetDeviceId) {
      const target = this.clients.get(message.targetDeviceId);
      if (target && target.userHash === sender.userHash) {
        this.send(target.ws, message);
      }
    } else {
      // Send to any other connected device
      this.broadcastToUser(sender.userHash, message, senderDeviceId);
    }
  }

  /**
   * Broadcast message to all of a user's devices
   */
  private broadcastToUser(userHash: string, message: SyncMessage, excludeDeviceId?: string): void {
    const deviceIds = this.userDevices.get(userHash);
    if (!deviceIds) return;

    for (const deviceId of deviceIds) {
      if (deviceId === excludeDeviceId) continue;

      const client = this.clients.get(deviceId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        this.send(client.ws, message);
      }
    }
  }

  /**
   * Send a message to a WebSocket
   */
  private send(ws: WebSocket, message: SyncMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send an error message
   */
  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'response',
      id: uuidv4(),
      deviceId: 'server',
      userHash: '',
      timestamp: Date.now(),
      payload: Buffer.from(JSON.stringify({ error })).toString('base64'),
    });
  }

  /**
   * Handle server errors
   */
  private handleError(error: Error): void {
    console.error('WebSocket server error:', error);
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = new Date();
      const timeout = this.config.heartbeatInterval * 2;

      for (const [deviceId, client] of this.clients) {
        const elapsed = now.getTime() - client.lastSeen.getTime();
        if (elapsed > timeout) {
          console.log(`Client ${deviceId} timed out, disconnecting`);
          client.ws.terminate();
          this.unregisterClient(deviceId);
        } else {
          // Send ping
          this.send(client.ws, {
            type: 'ping',
            id: uuidv4(),
            deviceId: 'server',
            userHash: client.userHash,
            timestamp: Date.now(),
          });
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Get server stats
   */
  getStats(): {
    connectedClients: number;
    connectedUsers: number;
    uptime: number;
  } {
    return {
      connectedClients: this.clients.size,
      connectedUsers: this.userDevices.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Get connected devices for a user
   */
  getUserDevices(userHash: string): string[] {
    return Array.from(this.userDevices.get(userHash) ?? []);
  }
}
