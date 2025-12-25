/**
 * HMAN Signal Integration
 *
 * Provides Signal messaging capabilities for HMAN notifications,
 * access request approvals, and secure data sharing.
 *
 * Uses signal-cli as the backend for Signal Protocol handling.
 * See: https://github.com/AsamK/signal-cli
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AccessRequest } from '@hman/shared';

// Signal message types
export interface SignalMessage {
  id: string;
  timestamp: number;
  sender: string;
  recipient: string;
  body: string;
  attachments?: SignalAttachment[];
  isGroup: boolean;
  groupId?: string;
}

export interface SignalAttachment {
  contentType: string;
  filename: string;
  data: Buffer;
}

export interface SignalConfig {
  /** Phone number in E.164 format (e.g., +61420309085) */
  phoneNumber: string;
  /** Path to signal-cli executable */
  signalCliPath?: string;
  /** Path to signal-cli data directory */
  dataPath?: string;
  /** Enable JSON-RPC daemon mode */
  daemonMode?: boolean;
}

export interface SignalRegistration {
  phoneNumber: string;
  captcha?: string;
  voice?: boolean;
}

// Events emitted by SignalService
export interface SignalServiceEvents {
  message: (message: SignalMessage) => void;
  receipt: (receipt: { sender: string; timestamp: number }) => void;
  error: (error: Error) => void;
  connected: () => void;
  disconnected: () => void;
}

/**
 * Signal Service - handles Signal messaging for HMAN
 */
export class SignalService extends EventEmitter {
  private config: SignalConfig;
  private daemon: ChildProcess | null = null;
  private isConnected = false;
  private messageQueue: SignalMessage[] = [];

  constructor(config: SignalConfig) {
    super();
    this.config = {
      signalCliPath: 'signal-cli',
      dataPath: join(process.env.HOME || '/tmp', '.hman', 'signal'),
      daemonMode: true,
      ...config,
    };
  }

  /**
   * Check if signal-cli is installed and configured
   */
  async checkInstallation(): Promise<{
    installed: boolean;
    registered: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      const result = await this.runCommand(['--version']);
      const version = result.stdout.trim();

      // Check if registered
      const registered = await this.isRegistered();

      return {
        installed: true,
        registered,
        version,
      };
    } catch (error) {
      return {
        installed: false,
        registered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if the phone number is registered
   */
  private async isRegistered(): Promise<boolean> {
    try {
      await this.runCommand(['-u', this.config.phoneNumber, 'listIdentities']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register a new Signal account (requires verification code)
   */
  async register(options: SignalRegistration): Promise<{ success: boolean; error?: string }> {
    try {
      const args = ['-u', options.phoneNumber, 'register'];

      if (options.captcha) {
        args.push('--captcha', options.captcha);
      }

      if (options.voice) {
        args.push('--voice');
      }

      await this.runCommand(args);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      };
    }
  }

  /**
   * Verify registration with SMS code
   */
  async verify(code: string): Promise<{ success: boolean; error?: string }> {
    try {
      await this.runCommand(['-u', this.config.phoneNumber, 'verify', code]);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Link as a secondary device (scan QR code from primary device)
   */
  async link(deviceName: string = 'HMAN'): Promise<{ uri: string; success?: boolean; error?: string }> {
    return new Promise((resolve) => {
      const args = ['link', '-n', deviceName];

      const proc = spawn(this.config.signalCliPath!, args, {
        env: { ...process.env, SIGNAL_CLI_CONFIG: this.config.dataPath },
      });

      let uri = '';

      proc.stdout.on('data', (data) => {
        const output = data.toString();
        // signal-cli outputs the linking URI
        if (output.includes('sgnl://')) {
          uri = output.match(/sgnl:\/\/[^\s]+/)?.[0] || '';
        }
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ uri, success: true });
        } else {
          resolve({ uri, success: false, error: 'Linking failed' });
        }
      });

      proc.on('error', (error) => {
        resolve({ uri: '', success: false, error: error.message });
      });

      // Return URI immediately for QR code display
      setTimeout(() => {
        if (uri) {
          resolve({ uri });
        }
      }, 5000);
    });
  }

  /**
   * Start the Signal daemon for receiving messages
   */
  async startDaemon(): Promise<void> {
    if (this.daemon) {
      return;
    }

    const args = ['-u', this.config.phoneNumber, 'daemon', '--json'];

    this.daemon = spawn(this.config.signalCliPath!, args, {
      env: { ...process.env, SIGNAL_CLI_CONFIG: this.config.dataPath },
    });

    this.daemon.stdout?.on('data', (data) => {
      this.handleDaemonOutput(data.toString());
    });

    this.daemon.stderr?.on('data', (data) => {
      console.error('[Signal]', data.toString());
    });

    this.daemon.on('close', () => {
      this.isConnected = false;
      this.daemon = null;
      this.emit('disconnected');
    });

    this.daemon.on('error', (error) => {
      this.emit('error', error);
    });

    this.isConnected = true;
    this.emit('connected');
  }

  /**
   * Stop the Signal daemon
   */
  async stopDaemon(): Promise<void> {
    if (this.daemon) {
      this.daemon.kill();
      this.daemon = null;
      this.isConnected = false;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(
    recipient: string,
    message: string,
    options?: { attachment?: string }
  ): Promise<{ success: boolean; timestamp?: number; error?: string }> {
    try {
      const args = ['-u', this.config.phoneNumber, 'send', '-m', message, recipient];

      if (options?.attachment) {
        args.push('-a', options.attachment);
      }

      const result = await this.runCommand(args);
      const timestamp = Date.now();

      return { success: true, timestamp };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
      };
    }
  }

  /**
   * Send an HMAN access request notification via Signal
   */
  async sendAccessRequestNotification(
    recipient: string,
    request: AccessRequest
  ): Promise<{ success: boolean; error?: string }> {
    const message = `🔐 HMAN Access Request

Requester: ${request.requester.name}
Type: ${request.requester.type}
Resource: ${request.resource.uri}
Purpose: ${request.purpose}

Reply with:
• APPROVE - to grant access
• DENY - to reject
• APPROVE:1h - to grant for 1 hour
• APPROVE:1d - to grant for 1 day`;

    return this.sendMessage(recipient, message);
  }

  /**
   * Send an .hman file via Signal
   */
  async sendHmanFile(
    recipient: string,
    filePath: string,
    description?: string
  ): Promise<{ success: boolean; error?: string }> {
    const message = description || '📁 HMAN Export File - Open with HMAN app to import';
    return this.sendMessage(recipient, message, { attachment: filePath });
  }

  /**
   * Receive pending messages
   */
  async receiveMessages(): Promise<SignalMessage[]> {
    try {
      const result = await this.runCommand(['-u', this.config.phoneNumber, 'receive', '--json']);
      const lines = result.stdout.trim().split('\n').filter(Boolean);

      const messages: SignalMessage[] = [];

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.envelope?.dataMessage) {
            messages.push(this.parseMessage(data));
          }
        } catch {
          // Skip malformed JSON
        }
      }

      return messages;
    } catch (error) {
      return [];
    }
  }

  /**
   * Parse access request response from message
   */
  parseAccessResponse(message: SignalMessage): {
    approved: boolean;
    duration?: number;
    reason?: string;
  } | null {
    const body = message.body.toUpperCase().trim();

    if (body.startsWith('APPROVE')) {
      let duration: number | undefined;

      // Parse duration like "APPROVE:1h" or "APPROVE:1d"
      const match = body.match(/APPROVE:(\d+)([HhDdMm])/);
      if (match) {
        const value = parseInt(match[1], 10);
        const unit = match[2].toLowerCase();

        switch (unit) {
          case 'h':
            duration = value * 60 * 60 * 1000; // hours to ms
            break;
          case 'd':
            duration = value * 24 * 60 * 60 * 1000; // days to ms
            break;
          case 'm':
            duration = value * 60 * 1000; // minutes to ms
            break;
        }
      }

      return { approved: true, duration };
    }

    if (body.startsWith('DENY')) {
      const reason = message.body.replace(/^DENY:?\s*/i, '').trim() || undefined;
      return { approved: false, reason };
    }

    return null;
  }

  /**
   * Handle daemon output (JSON-RPC messages)
   */
  private handleDaemonOutput(output: string): void {
    const lines = output.trim().split('\n');

    for (const line of lines) {
      try {
        const data = JSON.parse(line);

        if (data.envelope?.dataMessage) {
          const message = this.parseMessage(data);
          this.emit('message', message);
        }

        if (data.envelope?.receiptMessage) {
          this.emit('receipt', {
            sender: data.envelope.source,
            timestamp: data.envelope.receiptMessage.when,
          });
        }
      } catch {
        // Skip non-JSON output
      }
    }
  }

  /**
   * Parse raw Signal message to our format
   */
  private parseMessage(data: any): SignalMessage {
    const envelope = data.envelope;
    const dataMessage = envelope.dataMessage;

    return {
      id: `${envelope.source}-${envelope.timestamp}`,
      timestamp: envelope.timestamp,
      sender: envelope.source,
      recipient: this.config.phoneNumber,
      body: dataMessage.message || '',
      attachments: dataMessage.attachments?.map((a: any) => ({
        contentType: a.contentType,
        filename: a.filename,
        data: Buffer.from([]), // Attachments need to be fetched separately
      })),
      isGroup: !!dataMessage.groupInfo,
      groupId: dataMessage.groupInfo?.groupId,
    };
  }

  /**
   * Run a signal-cli command
   */
  private runCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.signalCliPath!, args, {
        env: { ...process.env, SIGNAL_CLI_CONFIG: this.config.dataPath },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      proc.on('error', reject);
    });
  }
}

/**
 * Create a Signal service instance
 */
export function createSignalService(phoneNumber: string): SignalService {
  return new SignalService({ phoneNumber });
}

/**
 * HMAN Signal Bridge - connects Signal to HMAN access control
 */
export class HmanSignalBridge {
  private signalService: SignalService;
  private pendingRequests: Map<string, AccessRequest> = new Map();
  private notificationNumber: string;

  constructor(signalService: SignalService, notificationNumber: string) {
    this.signalService = signalService;
    this.notificationNumber = notificationNumber;

    // Listen for responses
    this.signalService.on('message', (message) => {
      this.handleIncomingMessage(message);
    });
  }

  /**
   * Send access request and wait for response
   */
  async requestApproval(
    request: AccessRequest,
    timeout: number = 5 * 60 * 1000 // 5 minutes
  ): Promise<{ approved: boolean; duration?: number; reason?: string }> {
    // Store pending request
    this.pendingRequests.set(request.id, request);

    // Send notification
    await this.signalService.sendAccessRequestNotification(
      this.notificationNumber,
      request
    );

    // Wait for response with timeout
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        resolve({ approved: false, reason: 'Request timed out' });
      }, timeout);

      // Response handler will resolve this
      const handler = (message: SignalMessage) => {
        if (message.sender === this.notificationNumber) {
          const response = this.signalService.parseAccessResponse(message);
          if (response) {
            clearTimeout(timeoutId);
            this.pendingRequests.delete(request.id);
            this.signalService.off('message', handler);
            resolve(response);
          }
        }
      };

      this.signalService.on('message', handler);
    });
  }

  /**
   * Handle incoming Signal messages
   */
  private handleIncomingMessage(message: SignalMessage): void {
    // Could add more handlers here for different message types
    console.log(`[Signal] Message from ${message.sender}: ${message.body}`);
  }

  /**
   * Send a notification
   */
  async notify(text: string): Promise<void> {
    await this.signalService.sendMessage(this.notificationNumber, text);
  }

  /**
   * Share an .hman file
   */
  async shareHmanFile(filePath: string, description?: string): Promise<void> {
    await this.signalService.sendHmanFile(this.notificationNumber, filePath, description);
  }
}
