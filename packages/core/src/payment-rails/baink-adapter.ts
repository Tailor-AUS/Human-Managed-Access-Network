/**
 * baink adapter — speaks to aink.tailor.au.
 *
 * baink is a Tailor-owned aggregator exposing a Stripe-shaped REST
 * surface over Monoova (PayID/PayTo), Tyro (POS) and BPAY. This
 * adapter covers PayID / OSKO / BPay nominations; Tyro POS is a
 * separate concern (in-person card-present).
 *
 * Endpoints used (from aink.tailor.au landing page):
 *   POST   /api/baink/invoices          — create invoice
 *   GET    /api/baink/invoices/:id      — retrieve invoice
 *   POST   /api/baink/invoices/:id/send — send payment link
 *   POST   /api/baink/payments          — record payment
 *   GET    /api/baink/ledger            — ledger entries
 *   GET    /api/baink/reconciliation    — reconciliation report
 *
 * TODO (pending live API docs):
 *   - Confirm auth header shape (assuming Bearer + API key for now)
 *   - Confirm request/response JSON shapes (using conservative defaults)
 *   - Webhook signature verification for verifyProof()
 */

import type {
  PaymentRailAdapter,
  PaymentRailNomination,
  RailDescription,
  SettlementEvent,
  SettlementIntent,
  SettlementProof,
  VerifyResult,
} from '@hman/shared';

export interface BainkAdapterConfig {
  /** Base URL for the baink API. Defaults to https://aink.tailor.au. */
  baseUrl?: string;
  /** API key used for Authorization: Bearer <key>. */
  apiKey: string;
  /** Fetch implementation (injected for tests). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Poll interval for settlement status, ms. Defaults to 2000. */
  pollIntervalMs?: number;
  /** Hard cap on polling iterations. Defaults to 60 (≈2 min at 2s). */
  maxPollAttempts?: number;
}

/**
 * Rails handled by baink in this adapter: PayID and BPay at send time,
 * plus OSKO as a selection-time synonym (baink settles PayID via OSKO
 * under the hood). Stripe card nominations route to the Stripe adapter.
 */
const HANDLED_RAILS = new Set(['payid', 'osko', 'bpay']);

export class BainkAdapter implements PaymentRailAdapter {
  readonly id = 'baink';
  readonly currencies = ['AUD'];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(config: BainkAdapterConfig) {
    if (!config.apiKey) {
      throw new Error('BainkAdapter: apiKey is required');
    }
    this.baseUrl = (config.baseUrl ?? 'https://aink.tailor.au').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.pollIntervalMs = config.pollIntervalMs ?? 2000;
    this.maxPollAttempts = config.maxPollAttempts ?? 60;
  }

  handles(nomination: PaymentRailNomination): boolean {
    return HANDLED_RAILS.has(nomination.rail);
  }

  describe(nomination: PaymentRailNomination): RailDescription {
    switch (nomination.rail) {
      case 'payid':
        return {
          railId: this.id,
          summary: `PayID ${nomination.alias} via baink (Monoova-backed)`,
          typicalSettlementWindow: 'near-real-time (seconds)',
        };
      case 'osko':
        return {
          railId: this.id,
          summary: `OSKO BSB ${nomination.bsb} acct ${nomination.accountNumber} via baink`,
          typicalSettlementWindow: 'near-real-time (seconds)',
        };
      case 'bpay':
        return {
          railId: this.id,
          summary: `BPay biller ${nomination.billerCode}${
            nomination.customerReferenceNumber
              ? ` CRN ${nomination.customerReferenceNumber}`
              : ''
          } via baink`,
          typicalSettlementWindow: '1 business day',
        };
      default:
        return {
          railId: this.id,
          summary: 'unsupported rail for baink',
          typicalSettlementWindow: 'n/a',
        };
    }
  }

  async *settle(intent: SettlementIntent): AsyncIterable<SettlementEvent> {
    if (!this.handles(intent.rail_nomination)) {
      yield {
        kind: 'failed',
        at: new Date().toISOString(),
        code: 'unsupported_rail',
        message: `baink does not handle rail: ${intent.rail_nomination.rail}`,
        retryable: false,
      };
      return;
    }

    // 1. Create invoice
    let invoiceId: string;
    try {
      const invoice = await this.request<BainkInvoice>('POST', '/api/baink/invoices', {
        amount: intent.amount.value,
        currency: intent.amount.currency,
        reference: intent.reference ?? intent.offer_id,
        idempotency_key: intent.idempotency_key,
        rail: intent.rail_nomination.rail,
        rail_nomination: intent.rail_nomination,
        metadata: {
          offer_id: intent.offer_id,
          commit_id: intent.commit_id,
          from_entity: intent.from_entity,
          to_entity: intent.to_entity,
        },
      });
      invoiceId = invoice.id;

      yield {
        kind: 'submitted',
        at: new Date().toISOString(),
        rail_reference: invoiceId,
      };
    } catch (err) {
      yield this.failureFrom(err, /*retryable*/ true);
      return;
    }

    // 2. Send payment link
    try {
      await this.request('POST', `/api/baink/invoices/${invoiceId}/send`, {});
      yield {
        kind: 'status_update',
        at: new Date().toISOString(),
        status: 'payment_link_sent',
      };
    } catch (err) {
      yield this.failureFrom(err, /*retryable*/ true);
      return;
    }

    // 3. Poll for settlement
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await sleep(this.pollIntervalMs);
      let invoice: BainkInvoice;
      try {
        invoice = await this.request<BainkInvoice>(
          'GET',
          `/api/baink/invoices/${invoiceId}`
        );
      } catch (err) {
        yield {
          kind: 'status_update',
          at: new Date().toISOString(),
          status: 'poll_error',
          message: errorMessage(err),
        };
        continue;
      }

      if (invoice.status === 'settled' && invoice.settled_at) {
        yield {
          kind: 'settled',
          at: new Date().toISOString(),
          proof: {
            rail: this.id,
            rail_reference: invoiceId,
            settled_at: invoice.settled_at,
            amount: intent.amount,
            details: {
              rail_used: intent.rail_nomination.rail,
              ledger_entry_id: invoice.ledger_entry_id,
              reconciliation_token: invoice.reconciliation_token,
            },
          },
        };
        return;
      }

      if (invoice.status === 'failed' || invoice.status === 'cancelled') {
        yield {
          kind: 'failed',
          at: new Date().toISOString(),
          code: invoice.status,
          message: invoice.failure_reason ?? `baink invoice ${invoice.status}`,
          retryable: invoice.status === 'failed',
        };
        return;
      }

      yield {
        kind: 'status_update',
        at: new Date().toISOString(),
        status: invoice.status,
      };
    }

    yield {
      kind: 'failed',
      at: new Date().toISOString(),
      code: 'poll_timeout',
      message: 'baink did not settle within the configured polling window',
      retryable: true,
    };
  }

  async verifyProof(proof: SettlementProof): Promise<VerifyResult> {
    if (proof.rail !== this.id) {
      return { valid: false, reason: `rail mismatch: ${proof.rail}` };
    }
    try {
      const invoice = await this.request<BainkInvoice>(
        'GET',
        `/api/baink/invoices/${proof.rail_reference}`
      );
      if (invoice.status !== 'settled') {
        return { valid: false, reason: `invoice not settled: ${invoice.status}` };
      }
      if (invoice.amount !== proof.amount.value) {
        return { valid: false, reason: 'amount mismatch' };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: errorMessage(err) };
    }
  }

  // ---------------------------------------------------------------------------

  private failureFrom(err: unknown, retryable: boolean): SettlementEvent {
    return {
      kind: 'failed',
      at: new Date().toISOString(),
      code: 'http_error',
      message: errorMessage(err),
      retryable,
    };
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    };
    if (body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetchImpl(url, init);
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`baink ${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}

// -----------------------------------------------------------------------------
// baink wire types (conservative — refine when live API docs land)
// -----------------------------------------------------------------------------

interface BainkInvoice {
  id: string;
  status: 'draft' | 'sent' | 'awaiting_payment' | 'settled' | 'failed' | 'cancelled';
  amount: string;             // decimal string matching SettlementIntent.amount.value
  currency: string;
  settled_at?: string;        // ISO 8601
  failure_reason?: string;
  ledger_entry_id?: string;
  reconciliation_token?: string;
}

// -----------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
