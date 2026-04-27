// ConstantTime.swift — timing-safe comparison helpers.
//
// Mirrors the desktop's `secureCompare` in `packages/core/src/crypto/encryption.ts`,
// which delegates to libsodium's `sodium_compare`. We use libsodium here too
// (via Clibsodium) so the constant-time guarantee comes from the same
// implementation on both platforms — not a hand-rolled XOR loop that the
// Swift compiler might helpfully optimise back into a short-circuit.
//
// Use this for any byte-comparison that touches secret material:
//   * stored key-hash verification
//   * MAC tag comparison outside of libsodium's own AEAD path
//   * delegation token equality checks
// Plain `==` on `Data` is variable-time and leaks length-prefix info.

import Foundation
import Sodium
import Clibsodium

public enum ConstantTime {
    /// Returns true iff `a` and `b` have the same length AND the same
    /// contents. The length check is variable-time — that's intentional
    /// and matches libsodium / desktop semantics. The byte compare is
    /// constant-time, so attackers can learn "right length yes/no" but
    /// nothing about which byte differs when the length matches.
    public static func equal(_ a: Data, _ b: Data) -> Bool {
        // Constructing Sodium() is the canonical way to ensure libsodium
        // has run sodium_init() — the wrapper guards that with a one-shot
        // dispatch internally, so this is cheap on subsequent calls and
        // necessary the first time anyone touches the library.
        _ = Sodium()
        guard a.count == b.count else { return false }
        if a.isEmpty { return true }
        return a.withUnsafeBytes { aPtr in
            b.withUnsafeBytes { bPtr in
                guard let aBase = aPtr.baseAddress, let bBase = bPtr.baseAddress else {
                    return false
                }
                // sodium_memcmp returns 0 on equal, -1 otherwise. It does
                // NOT short-circuit on the first mismatching byte.
                return sodium_memcmp(aBase, bBase, a.count) == 0
            }
        }
    }
}
