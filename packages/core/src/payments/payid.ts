/**
 * PayID Integration Module
 *
 * Provides payment functionality using Australia's PayID system.
 * This is an abstraction layer - actual implementation would require
 * bank API integration (e.g., Up Bank, Macquarie, etc.)
 */

import { v4 as uuidv4 } from 'uuid';
import { PermissionLevel } from '@hman/shared';
import { AuditLogger } from '../audit/index.js';

export interface PayIDAddress {
  /** PayID type (email, phone, ABN, org) */
  type: 'email' | 'phone' | 'abn' | 'org';
  /** The PayID value */
  value: string;
  /** Display name associated with the PayID */
  name?: string;
}

export interface PaymentRequest {
  /** Unique payment request ID */
  id: string;
  /** Payee information */
  payee: PayIDAddress;
  /** Payment amount */
  amount: number;
  /** Currency code */
  currency: string;
  /** Payment reference/description */
  reference: string;
  /** Due date for the payment */
  dueDate?: Date;
  /** Category for tracking */
  category?: string;
  /** Who requested this payment (bot ID, etc.) */
  requestedBy?: string;
  /** When the request was created */
  createdAt: Date;
  /** Request status */
  status: 'pending' | 'approved' | 'executed' | 'failed' | 'cancelled';
  /** Error message if failed */
  errorMessage?: string;
}

export interface PaymentResult {
  /** Whether the payment was successful */
  success: boolean;
  /** Transaction ID from the payment provider */
  transactionId?: string;
  /** When the payment was executed */
  executedAt?: Date;
  /** Error message if failed */
  error?: string;
  /** Receipt reference */
  receiptReference?: string;
}

export interface PaymentProviderConfig {
  /** Provider name */
  name: string;
  /** API endpoint */
  apiEndpoint?: string;
  /** API key (would be stored securely) */
  apiKey?: string;
  /** Whether to use sandbox mode */
  sandbox?: boolean;
}

/**
 * Payment Provider Interface
 * Implement this for specific bank integrations
 */
export interface PaymentProvider {
  /** Provider name */
  readonly name: string;

  /** Validate a PayID address */
  validatePayID(payId: PayIDAddress): Promise<{ valid: boolean; name?: string }>;

  /** Execute a payment */
  executePayment(
    payee: PayIDAddress,
    amount: number,
    currency: string,
    reference: string
  ): Promise<PaymentResult>;

  /** Get account balance */
  getBalance(): Promise<{ available: number; pending: number; currency: string }>;

  /** Get recent transactions */
  getTransactions(limit?: number): Promise<Transaction[]>;
}

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  description: string;
  counterparty?: string;
  timestamp: Date;
  status: 'pending' | 'completed' | 'failed';
}

/**
 * Mock Payment Provider for development/testing
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'Mock Bank';
  private balance = 10000;
  private transactions: Transaction[] = [];

  async validatePayID(payId: PayIDAddress): Promise<{ valid: boolean; name?: string }> {
    // Simulate validation
    await this.simulateDelay(500);

    // Simple validation
    if (payId.type === 'email' && payId.value.includes('@')) {
      return { valid: true, name: payId.name ?? 'Valid PayID' };
    }
    if (payId.type === 'phone' && payId.value.match(/^\+?[0-9]{10,}$/)) {
      return { valid: true, name: payId.name ?? 'Valid PayID' };
    }

    return { valid: false };
  }

  async executePayment(
    payee: PayIDAddress,
    amount: number,
    currency: string,
    reference: string
  ): Promise<PaymentResult> {
    await this.simulateDelay(1000);

    if (amount > this.balance) {
      return {
        success: false,
        error: 'Insufficient funds',
      };
    }

    // Simulate successful payment
    this.balance -= amount;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const transaction: Transaction = {
      id: transactionId,
      type: 'debit',
      amount,
      currency,
      description: reference,
      counterparty: payee.name ?? payee.value,
      timestamp: new Date(),
      status: 'completed',
    };
    this.transactions.unshift(transaction);

    return {
      success: true,
      transactionId,
      executedAt: new Date(),
      receiptReference: `RCP-${transactionId}`,
    };
  }

  async getBalance(): Promise<{ available: number; pending: number; currency: string }> {
    await this.simulateDelay(200);
    return { available: this.balance, pending: 0, currency: 'AUD' };
  }

  async getTransactions(limit = 10): Promise<Transaction[]> {
    await this.simulateDelay(300);
    return this.transactions.slice(0, limit);
  }

  private simulateDelay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // For testing
  setBalance(balance: number): void {
    this.balance = balance;
  }
}

/**
 * Payment Manager - orchestrates payment operations
 */
export class PaymentManager {
  private provider: PaymentProvider;
  private auditLogger: AuditLogger;
  private pendingRequests: Map<string, PaymentRequest> = new Map();
  // Reserved for HITL approval integration
  private _onApprovalRequired?: (request: PaymentRequest) => Promise<boolean>;

  constructor(config: {
    provider: PaymentProvider;
    auditLogger: AuditLogger;
    onApprovalRequired?: (request: PaymentRequest) => Promise<boolean>;
  }) {
    this.provider = config.provider;
    this.auditLogger = config.auditLogger;
    this._onApprovalRequired = config.onApprovalRequired;
  }

  /**
   * Create a payment request (requires approval)
   */
  async createPaymentRequest(params: {
    payee: PayIDAddress;
    amount: number;
    currency?: string;
    reference: string;
    dueDate?: Date;
    category?: string;
    requestedBy?: string;
  }): Promise<PaymentRequest> {
    // Validate PayID first
    const validation = await this.provider.validatePayID(params.payee);
    if (!validation.valid) {
      throw new Error('Invalid PayID');
    }

    const request: PaymentRequest = {
      id: uuidv4(),
      payee: { ...params.payee, name: validation.name },
      amount: params.amount,
      currency: params.currency ?? 'AUD',
      reference: params.reference,
      dueDate: params.dueDate,
      category: params.category,
      requestedBy: params.requestedBy,
      createdAt: new Date(),
      status: 'pending',
    };

    this.pendingRequests.set(request.id, request);

    // Log the request
    await this.auditLogger.log(
      'payment_requested',
      {
        type: params.requestedBy ? 'bot' : 'user',
        id: params.requestedBy ?? 'user',
        name: params.requestedBy ?? 'User',
      },
      {
        uri: `hman://payments/${request.id}`,
        vaultId: 'finance',
        permissionLevel: PermissionLevel.Gated,
      },
      { success: true },
      {
        payee: params.payee.value,
        amount: params.amount,
        currency: request.currency,
        reference: params.reference,
      }
    );

    return request;
  }

  /**
   * Approve a payment request
   */
  async approvePayment(requestId: string): Promise<PaymentRequest> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot approve payment with status: ${request.status}`);
    }

    request.status = 'approved';

    // Log approval
    await this.auditLogger.log(
      'payment_approved',
      { type: 'user', id: 'user', name: 'User' },
      {
        uri: `hman://payments/${request.id}`,
        vaultId: 'finance',
        permissionLevel: PermissionLevel.Gated,
      },
      { success: true },
      {
        payee: request.payee.value,
        amount: request.amount,
      }
    );

    return request;
  }

  /**
   * Execute an approved payment
   */
  async executePayment(requestId: string): Promise<PaymentResult> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.status !== 'approved') {
      throw new Error(`Cannot execute payment with status: ${request.status}`);
    }

    const result = await this.provider.executePayment(
      request.payee,
      request.amount,
      request.currency,
      request.reference
    );

    if (result.success) {
      request.status = 'executed';
    } else {
      request.status = 'failed';
      request.errorMessage = result.error;
    }

    // Log execution
    await this.auditLogger.log(
      'payment_executed',
      { type: 'system', id: 'payment-system', name: 'Payment System' },
      {
        uri: `hman://payments/${request.id}`,
        vaultId: 'finance',
        permissionLevel: PermissionLevel.Gated,
      },
      { success: result.success, failureReason: result.error },
      {
        transactionId: result.transactionId,
        payee: request.payee.value,
        amount: request.amount,
      }
    );

    this.pendingRequests.delete(requestId);
    return result;
  }

  /**
   * Cancel a pending payment request
   */
  async cancelPayment(requestId: string, reason?: string): Promise<PaymentRequest> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      throw new Error('Payment request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot cancel payment with status: ${request.status}`);
    }

    request.status = 'cancelled';
    request.errorMessage = reason;

    // Log cancellation
    await this.auditLogger.log(
      'payment_denied',
      { type: 'user', id: 'user', name: 'User' },
      {
        uri: `hman://payments/${request.id}`,
        vaultId: 'finance',
        permissionLevel: PermissionLevel.Gated,
      },
      { success: false, failureReason: reason ?? 'Cancelled by user' },
      {
        payee: request.payee.value,
        amount: request.amount,
      }
    );

    this.pendingRequests.delete(requestId);
    return request;
  }

  /**
   * Get all pending payment requests
   */
  getPendingRequests(): PaymentRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  /**
   * Get a specific payment request
   */
  getRequest(requestId: string): PaymentRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  /**
   * Get account balance
   */
  async getBalance(): Promise<{ available: number; pending: number; currency: string }> {
    return this.provider.getBalance();
  }

  /**
   * Get recent transactions
   */
  async getTransactions(limit?: number): Promise<Transaction[]> {
    return this.provider.getTransactions(limit);
  }

  /**
   * Quick pay - create, approve, and execute in one step
   * Only use for pre-authorized payments
   */
  async quickPay(params: {
    payee: PayIDAddress;
    amount: number;
    reference: string;
  }): Promise<PaymentResult> {
    const request = await this.createPaymentRequest(params);
    await this.approvePayment(request.id);
    return this.executePayment(request.id);
  }
}
