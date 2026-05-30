/**
 * Canonical JSON encoding + hashing.
 *
 * Two parties must compute the *same* bytes for the same logical object so
 * their signatures over it agree. We achieve that by recursively sorting
 * object keys and serialising with `JSON.stringify`. Arrays keep their order
 * (order is meaningful); `undefined` properties are dropped, matching
 * `JSON.stringify` semantics.
 */

import { createHash } from 'node:crypto';

/** Deterministic JSON string for `value` (object keys sorted recursively). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

/** UTF-8 bytes of {@link canonicalJson} — the input to signers/verifiers. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

/** Lowercase hex SHA-256 of the given bytes (or UTF-8 of a string). */
export function sha256Hex(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  const obj = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    if (obj[key] === undefined) continue;
    sorted[key] = canonicalise(obj[key]);
  }
  return sorted;
}
