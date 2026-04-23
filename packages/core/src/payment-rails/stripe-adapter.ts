/**
 * Stripe adapter — international fallback for non-Australian
 * counterparties, or when the payer doesn't have PayID / Osko access.
 *
 * Implemented against Stripe's Payment Intents API. Uses
 * form-urlencoded bodies (Stripe's convention) rather than JSON.
 *
 * In Phase 3 this is wired with a happy-path polling flow only.
 * Webhook-driven settlement (and fee accounting) lands in Phase 3.5.
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

export interface StripeAdapterConfig {
  /** Stripe secret key (sk_live_... / sk_test_...). */
  apiKey: string;
  /** Base URL. Defaults to https://api.stripe.com. */
  baseUrl?: string;
  /** Injected fetch for tests. Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Poll interval for PaymentIntent status, ms. Defaults to 2000. */
  pollIntervalMs?: number;
  /** Hard cap on polling iterations. Defaults to 30. */
  maxPollAttempts?: number;
}

export class StripeAdapter implements PaymentRailAdapter {
  readonly id = 'stripe';
  readonly currencies = ['AUD', 'USD', 'EUR', 'GBP', 'NZD'];

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly maxPollAttempts: number;

  constructor(config: StripeAdapterConfig) {
    if (!config.apiKey) {
      throw new Error('StripeAdapter: apiKey is required');
    }
    this.baseUrl = (config.baseUrl ?? 'https://api.stripe.com').replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetch ?? globalThis.fetch;
    this.pollIntervalMs = config.pollIntervalMs ?? 2000;
    this.maxPollAttempts = config.maxPollAttempts ?? 30;
  }

  handles(nomination: PaymentRailNomination): boolean {
    return nomination.rail === 'stripe';
  }

  describe(nomination: PaymentRailNomination): RailDescription {
    if (nomination.rail !== 'stripe') {
      return {
        railId: this.id,
        summary: 'unsupported nomination for Stripe adapter',
        typicalSettlementWindow: 'n/a',
      };
    }
    const target =
      nomination.customerId ??
      nomination.connectedAccountId ??
      '<unconfigured>';
    return {
      railId: this.id,
      summary: `Stripe ${target} (card / Apple Pay / Google Pay)`,
      typicalSettlementWindow: 'settlement T+2 business days',
    };
  }

  async *settle(intent: SettlementIntent): AsyncIterable<SettlementEvent> {
    if (!this.handles(intent.rail_nomination)) {
      yield {
        kind: 'failed',
        at: new Date().toISOString(),
        code: 'unsupported_rail',
        message: `Stripe adapter does not handle rail: ${intent.rail_nomination.rail}`,
        retryable: false,
      };
      return;
    }

    const nomination = intent.rail_nomination as Extract<
      PaymentRailNomination,
      { rail: 'stripe' }
    >;

    // Convert decimal string amount → integer minor units (Stripe convention).
    const amountMinor = decimalToMinor(intent.amount.value);

    // 1. Create PaymentIntent (idempotent via header).
    let piId: string;
    try {
      const pi = await this.request<StripePaymentIntent>('POST', '/v1/payment_intents', {
        amount: String(amountMinor),
        currency: intent.amount.currency.toLowerCase(),
        ...(nomination.customerId && { customer: nomination.customerId }),
        ...(nomination.connectedAccountId && {
          'transfer_data[destination]': nomination.connectedAccountId,
        }),
        description: intent.reference ?? intent.offer_id,
        'metadata[offer_id]': intent.offer_id,
        'metadata[commit_id]': intent.commit_id,
        'metadata[from_entity]': intent.from_entity,
        'metadata[to_entity]': intent.to_entity,
      }, intent.idempotency_key);

      piId = pi.id;
      yield {
        kind: 'submitted',
        at: new Date().toISOString(),
        rail_reference: piId,
      };
    } catch (err) {
      yield {
        kind: 'failed',
        at: new Date().toISOString(),
        code: 'http_error',
        message: errorMessage(err),
        retryable: true,
      };
      return;
    }

    // 2. Poll the PaymentIntent until it's `succeeded`, `canceled`, or
    //    we hit the iteration cap. Real prod use wires webhooks.
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await sleep(this.pollIntervalMs);
      let pi: StripePaymentIntent;
      try {
        pi = await this.request<StripePaymentIntent>(
          'GET',
          `/v1/payment_intents/${piId}`
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

      if (pi.status === 'succeeded') {
        yield {
          kind: 'settled',
          at: new Date().toISOString(),
          proof: {
            rail: this.id,
            rail_reference: piId,
            settled_at: new Date().toISOString(),
            amount: intent.amount,
            details: {
              payment_intent_status: pi.status,
              latest_charge: pi.latest_charge ?? null,
            },
          },
        };
        return;
      }

      if (pi.status === 'canceled') {
        yield {
          kind: 'failed',
          at: new Date().toISOString(),
          code: 'canceled',
          message: 'Stripe PaymentIntent canceled',
          retryable: false,
        };
        return;
      }

      yield {
        kind: 'status_update',
        at: new Date().toISOString(),
        status: pi.status,
      };
    }

    yield {
      kind: 'failed',
      at: new Date().toISOString(),
      code: 'poll_timeout',
      message: 'Stripe PaymentIntent did not settle within the polling window',
      retryable: true,
    };
  }

  async verifyProof(proof: SettlementProof): Promise<VerifyResult> {
    if (proof.rail !== this.id) {
      return { valid: false, reason: `rail mismatch: ${proof.rail}` };
    }
    try {
      const pi = await this.request<StripePaymentIntent>(
        'GET',
        `/v1/payment_intents/${proof.rail_reference}`
      );
      if (pi.status !== 'succeeded') {
        return { valid: false, reason: `status ${pi.status}` };
      }
      const expected = decimalToMinor(proof.amount.value);
      if (pi.amount !== expected) {
        return { valid: false, reason: 'amount mismatch' };
      }
      return { valid: true };
    } catch (err) {
      return { valid: false, reason: errorMessage(err) };
    }
  }

  // ---------------------------------------------------------------------------

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    form?: Record<string, string>,
    idempotencyKey?: string
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const init: RequestInit = { method, headers };
    if (form && method !== 'GET') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = new URLSearchParams(form).toString();
    }
    const res = await this.fetchImpl(url, init);
    if (!res.ok) {
      const text = await safeText(res);
      throw new Error(`stripe ${method} ${path} → ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}

// -----------------------------------------------------------------------------
// Minimal subset of the Stripe PaymentIntent shape we depend on.
// -----------------------------------------------------------------------------

interface StripePaymentIntent {
  id: string;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'succeeded'
    | 'canceled';
  amount: number;
  currency: string;
  latest_charge?: string | null;
}

// -----------------------------------------------------------------------------

function decimalToMinor(value: string): number {
  // Stripe charges in minor units (cents). "7.00" → 700, "12.5" → 1250.
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`invalid amount: ${value}`);
  }
  const [whole, frac = ''] = value.split('.');
  const padded = (frac + '00').slice(0, 2);
  const minor = Number(whole) * 100 + Number(padded);
  if (!Number.isFinite(minor) || minor < 0) {
    throw new Error(`invalid amount: ${value}`);
  }
  return minor;
}

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
