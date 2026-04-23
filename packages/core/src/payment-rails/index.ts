/**
 * Payment rail adapters — pluggable integrations for moving money
 * across rails nominated by entities in the Peer Protocol.
 *
 * Spec: PROTOCOL.md § Payment Rail Adapters.
 */

export { RailRegistry, type PaymentRailSelection } from './registry.js';
export { BainkAdapter, type BainkAdapterConfig } from './baink-adapter.js';
export { StripeAdapter, type StripeAdapterConfig } from './stripe-adapter.js';
