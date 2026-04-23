/**
 * RailRegistry — owns instantiated PaymentRailAdapter instances and
 * handles rail selection during the Peer Protocol handshake.
 *
 * A single adapter can handle multiple rail names (baink covers
 * payid / osko / bpay). Adapters expose `handles(nomination)` so the
 * registry can dispatch a rail nomination to the right adapter.
 *
 * Spec: PROTOCOL.md § Payment Rail Adapters (Rail Selection).
 */

import type {
  PaymentRailAdapter,
  PaymentRailNomination,
} from '@hman/shared';

/**
 * PaymentRailAdapter augmented with a predicate for rail dispatch.
 * Concrete adapters in this repo (baink, stripe, ...) implement it;
 * the interface in @hman/shared doesn't require it so third-party
 * adapters can stay minimal. Registry-consumed adapters should.
 */
export interface DispatchingRailAdapter extends PaymentRailAdapter {
  handles(nomination: PaymentRailNomination): boolean;
}

export class RailRegistry {
  private adapters: DispatchingRailAdapter[] = [];
  private byId = new Map<string, DispatchingRailAdapter>();

  register(adapter: DispatchingRailAdapter): void {
    if (this.byId.has(adapter.id)) {
      throw new Error(`Rail adapter already registered: ${adapter.id}`);
    }
    this.adapters.push(adapter);
    this.byId.set(adapter.id, adapter);
  }

  unregister(id: string): void {
    const adapter = this.byId.get(id);
    if (!adapter) return;
    this.byId.delete(id);
    this.adapters = this.adapters.filter((a) => a !== adapter);
  }

  get(id: string): DispatchingRailAdapter | null {
    return this.byId.get(id) ?? null;
  }

  list(): DispatchingRailAdapter[] {
    return [...this.adapters];
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /**
   * Find the first registered adapter that handles this nomination.
   */
  adapterFor(nomination: PaymentRailNomination): DispatchingRailAdapter | null {
    return this.adapters.find((a) => a.handles(nomination)) ?? null;
  }

  /**
   * Pick a rail for a settlement based on:
   *   1. Payer's ordered preference (their own nominated rails).
   *   2. Payee's advertised accepted rails (filter — must overlap by
   *      `rail` name; payee-side details are used, not payer-side).
   *   3. Adapters actually registered in this process that claim to
   *      handle the rail.
   *
   * Returns the highest-priority intersection. Null if no overlap.
   */
  selectRail(params: {
    payerPreference: PaymentRailNomination[];
    payeeAdvertised: PaymentRailNomination[];
  }): PaymentRailSelection | null {
    const payeeByRail = new Map<string, PaymentRailNomination>();
    for (const n of params.payeeAdvertised) payeeByRail.set(n.rail, n);

    for (const payer of params.payerPreference) {
      const payee = payeeByRail.get(payer.rail);
      if (!payee) continue;
      const adapter = this.adapterFor(payee);
      if (!adapter) continue;
      return { adapter, payerNomination: payer, payeeNomination: payee };
    }
    return null;
  }
}

export interface PaymentRailSelection {
  adapter: DispatchingRailAdapter;
  payerNomination: PaymentRailNomination;
  payeeNomination: PaymentRailNomination;
}
