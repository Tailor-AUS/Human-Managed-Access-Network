/**
 * Payment rail adapter tests — registry + baink + stripe.
 *
 * Uses an injected fetch stub so no real network calls leave the box.
 */

import { describe, it, expect } from 'vitest';
import type {
  PaymentRailNomination,
  SettlementEvent,
  SettlementIntent,
} from '@hman/shared';
import {
  BainkAdapter,
  StripeAdapter,
  RailRegistry,
} from '../payment-rails/index.js';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errResp(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/** Collect an async iterable into an array. */
async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

function baseIntent(rail: PaymentRailNomination['rail'], extra: Partial<SettlementIntent> = {}): SettlementIntent {
  return {
    offer_id: 'offer_1',
    commit_id: 'commit_1',
    from_entity: 'entity-payer',
    to_entity: 'entity-payee',
    amount: { value: '7.00', currency: 'AUD' },
    rail_nomination: nominationFor(rail),
    idempotency_key: 'idem-1',
    reference: 'two coffees',
    ...extra,
  };
}

function nominationFor(rail: PaymentRailNomination['rail']): PaymentRailNomination {
  switch (rail) {
    case 'payid':
      return { rail: 'payid', alias: '+61400000000', aliasType: 'phone' };
    case 'osko':
      return { rail: 'osko', bsb: '062001', accountNumber: '12345678', accountName: 'Cafe' };
    case 'bpay':
      return { rail: 'bpay', billerCode: '00000' };
    case 'stripe':
      return { rail: 'stripe', customerId: 'cus_test' };
  }
}

// -----------------------------------------------------------------------------
// RailRegistry
// -----------------------------------------------------------------------------

describe('RailRegistry', () => {
  const stubAdapter = (id: string, rails: PaymentRailNomination['rail'][]) => ({
    id,
    currencies: ['AUD'],
    handles: (n: PaymentRailNomination) => rails.includes(n.rail),
    describe: () => ({ railId: id, summary: '', typicalSettlementWindow: '' }),
    settle: async function* () { /* no-op */ },
    verifyProof: async () => ({ valid: true }),
  });

  it('registers and looks up adapters', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid', 'osko', 'bpay']));
    expect(reg.has('baink')).toBe(true);
    expect(reg.get('baink')?.id).toBe('baink');
    expect(reg.list().length).toBe(1);
  });

  it('throws on duplicate register', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid']));
    expect(() => reg.register(stubAdapter('baink', ['payid']))).toThrow();
  });

  it('unregisters', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid']));
    reg.unregister('baink');
    expect(reg.has('baink')).toBe(false);
  });

  it('adapterFor dispatches by rail name', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid', 'osko', 'bpay']));
    reg.register(stubAdapter('stripe', ['stripe']));

    expect(reg.adapterFor(nominationFor('payid'))?.id).toBe('baink');
    expect(reg.adapterFor(nominationFor('osko'))?.id).toBe('baink');
    expect(reg.adapterFor(nominationFor('bpay'))?.id).toBe('baink');
    expect(reg.adapterFor(nominationFor('stripe'))?.id).toBe('stripe');
  });

  it("selectRail returns the payer's top preference that intersects", () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid', 'osko', 'bpay']));
    reg.register(stubAdapter('stripe', ['stripe']));

    const sel = reg.selectRail({
      payerPreference: [nominationFor('payid'), nominationFor('stripe')],
      payeeAdvertised: [nominationFor('stripe'), nominationFor('payid')],
    });
    expect(sel?.adapter.id).toBe('baink'); // payid has higher payer priority → baink
  });

  it('selectRail skips rails with no registered adapter', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('stripe', ['stripe']));

    const sel = reg.selectRail({
      payerPreference: [nominationFor('payid'), nominationFor('stripe')],
      payeeAdvertised: [nominationFor('payid'), nominationFor('stripe')],
    });
    expect(sel?.adapter.id).toBe('stripe'); // no baink registered, falls through to stripe
  });

  it('selectRail returns null with no intersection', () => {
    const reg = new RailRegistry();
    reg.register(stubAdapter('baink', ['payid', 'osko', 'bpay']));

    const sel = reg.selectRail({
      payerPreference: [nominationFor('stripe')],
      payeeAdvertised: [nominationFor('stripe')],
    });
    expect(sel).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// BainkAdapter
// -----------------------------------------------------------------------------

describe('BainkAdapter', () => {
  it('settles via create → send → poll(settled)', async () => {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url, body });

      if (method === 'POST' && url.endsWith('/api/baink/invoices')) {
        return okJson({ id: 'inv_1', status: 'awaiting_payment', amount: '7.00', currency: 'AUD' });
      }
      if (method === 'POST' && url.endsWith('/api/baink/invoices/inv_1/send')) {
        return okJson({ ok: true });
      }
      if (method === 'GET' && url.endsWith('/api/baink/invoices/inv_1')) {
        return okJson({
          id: 'inv_1',
          status: 'settled',
          amount: '7.00',
          currency: 'AUD',
          settled_at: '2026-04-23T04:00:00Z',
          ledger_entry_id: 'ledger_1',
          reconciliation_token: 'rec_1',
        });
      }
      return errResp(404, 'unexpected url: ' + url);
    };

    const adapter = new BainkAdapter({
      apiKey: 'test-key',
      fetch: fetchStub,
      pollIntervalMs: 1,
      maxPollAttempts: 5,
    });

    const events = await collect(adapter.settle(baseIntent('payid')));

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('submitted');
    expect(kinds).toContain('settled');

    const settled = events.find((e) => e.kind === 'settled') as Extract<
      SettlementEvent,
      { kind: 'settled' }
    >;
    expect(settled.proof.rail).toBe('baink');
    expect(settled.proof.rail_reference).toBe('inv_1');
    expect(settled.proof.amount.value).toBe('7.00');
    expect(settled.proof.details.ledger_entry_id).toBe('ledger_1');

    // Create invoice body carries the idempotency key + metadata
    const create = calls.find((c) => c.url.endsWith('/api/baink/invoices'))!;
    expect((create.body as Record<string, unknown>).idempotency_key).toBe('idem-1');
    const meta = (create.body as Record<string, unknown>).metadata as Record<string, unknown>;
    expect(meta.offer_id).toBe('offer_1');
  });

  it('emits failed event when the create call 500s', async () => {
    const fetchStub: typeof fetch = async () =>
      errResp(500, 'internal error');
    const adapter = new BainkAdapter({
      apiKey: 'test-key',
      fetch: fetchStub,
      pollIntervalMs: 1,
      maxPollAttempts: 1,
    });

    const events = await collect(adapter.settle(baseIntent('payid')));
    expect(events[0].kind).toBe('failed');
  });

  it('rejects unsupported rails with a failed event', async () => {
    const adapter = new BainkAdapter({ apiKey: 'k', fetch: async () => okJson({}) });
    const events = await collect(adapter.settle(baseIntent('stripe')));
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('failed');
    const failure = events[0] as Extract<SettlementEvent, { kind: 'failed' }>;
    expect(failure.code).toBe('unsupported_rail');
  });

  it('verifyProof compares rail_reference and amount against the live invoice', async () => {
    const fetchStub: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/api/baink/invoices/inv_1')) {
        return okJson({
          id: 'inv_1',
          status: 'settled',
          amount: '7.00',
          currency: 'AUD',
        });
      }
      return errResp(404, url);
    };
    const adapter = new BainkAdapter({ apiKey: 'k', fetch: fetchStub });

    const ok = await adapter.verifyProof({
      rail: 'baink',
      rail_reference: 'inv_1',
      settled_at: '2026-04-23T04:00:00Z',
      amount: { value: '7.00', currency: 'AUD' },
      details: {},
    });
    expect(ok.valid).toBe(true);

    const wrongAmount = await adapter.verifyProof({
      rail: 'baink',
      rail_reference: 'inv_1',
      settled_at: '2026-04-23T04:00:00Z',
      amount: { value: '99.00', currency: 'AUD' },
      details: {},
    });
    expect(wrongAmount.valid).toBe(false);

    const wrongRail = await adapter.verifyProof({
      rail: 'stripe',
      rail_reference: 'inv_1',
      settled_at: '2026-04-23T04:00:00Z',
      amount: { value: '7.00', currency: 'AUD' },
      details: {},
    });
    expect(wrongRail.valid).toBe(false);
  });

  it('describe renders rail-specific summaries', () => {
    const adapter = new BainkAdapter({ apiKey: 'k', fetch: async () => okJson({}) });
    expect(
      adapter.describe(nominationFor('payid')).summary
    ).toMatch(/PayID.*\+61/);
    expect(
      adapter.describe(nominationFor('osko')).summary
    ).toMatch(/OSKO/);
    expect(
      adapter.describe(nominationFor('bpay')).summary
    ).toMatch(/BPay/);
  });
});

// -----------------------------------------------------------------------------
// StripeAdapter
// -----------------------------------------------------------------------------

describe('StripeAdapter', () => {
  it('creates a PaymentIntent with minor-unit amount and settles on succeeded', async () => {
    const calls: { method: string; url: string; idempotency?: string; form?: URLSearchParams }[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      const method = (init?.method ?? 'GET').toUpperCase();
      const form = init?.body
        ? new URLSearchParams(init.body as string)
        : undefined;
      const headers = new Headers(init?.headers ?? {});
      calls.push({ method, url, idempotency: headers.get('idempotency-key') ?? undefined, form });

      if (method === 'POST' && url.endsWith('/v1/payment_intents')) {
        return okJson({
          id: 'pi_1',
          status: 'processing',
          amount: 700,
          currency: 'aud',
        });
      }
      if (method === 'GET' && url.endsWith('/v1/payment_intents/pi_1')) {
        return okJson({
          id: 'pi_1',
          status: 'succeeded',
          amount: 700,
          currency: 'aud',
          latest_charge: 'ch_1',
        });
      }
      return errResp(404, url);
    };

    const adapter = new StripeAdapter({
      apiKey: 'sk_test_abc',
      fetch: fetchStub,
      pollIntervalMs: 1,
      maxPollAttempts: 5,
    });
    const events = await collect(adapter.settle(baseIntent('stripe')));

    const settled = events.find((e) => e.kind === 'settled') as Extract<
      SettlementEvent,
      { kind: 'settled' }
    >;
    expect(settled.proof.rail).toBe('stripe');
    expect(settled.proof.rail_reference).toBe('pi_1');

    // Idempotency key forwarded on POST only
    const create = calls.find((c) => c.method === 'POST')!;
    expect(create.idempotency).toBe('idem-1');

    // "7.00" converts to 700 cents
    expect(create.form?.get('amount')).toBe('700');
    expect(create.form?.get('currency')).toBe('aud');
    expect(create.form?.get('customer')).toBe('cus_test');
  });

  it('fails fast on unsupported nominations', async () => {
    const adapter = new StripeAdapter({
      apiKey: 'sk_test',
      fetch: async () => okJson({}),
    });
    const events = await collect(adapter.settle(baseIntent('payid')));
    expect(events.length).toBe(1);
    expect(events[0].kind).toBe('failed');
  });

  it('verifyProof checks status and amount in minor units', async () => {
    const fetchStub: typeof fetch = async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url.endsWith('/v1/payment_intents/pi_1')) {
        return okJson({
          id: 'pi_1',
          status: 'succeeded',
          amount: 700,
          currency: 'aud',
        });
      }
      return errResp(404, url);
    };
    const adapter = new StripeAdapter({ apiKey: 'sk_test', fetch: fetchStub });

    const ok = await adapter.verifyProof({
      rail: 'stripe',
      rail_reference: 'pi_1',
      settled_at: '2026-04-23T04:00:00Z',
      amount: { value: '7.00', currency: 'AUD' },
      details: {},
    });
    expect(ok.valid).toBe(true);

    const wrongAmount = await adapter.verifyProof({
      rail: 'stripe',
      rail_reference: 'pi_1',
      settled_at: '2026-04-23T04:00:00Z',
      amount: { value: '99.00', currency: 'AUD' },
      details: {},
    });
    expect(wrongAmount.valid).toBe(false);
  });

  it('rejects construction without an API key', () => {
    expect(() => new StripeAdapter({ apiKey: '' })).toThrow();
  });
});
