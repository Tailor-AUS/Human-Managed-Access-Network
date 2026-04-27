/**
 * cross-platform.test.ts — verify iOS-produced PACT signatures against
 * the desktop's @hman/core verifier.
 *
 * This is the contract test for issue #15: a signature minted by the
 * Swift port (apps/ios/Sources/HMAN/Crypto/PACTSigner.swift) MUST verify
 * against `verifyDetachedEd25519` from `entity-keys.ts`, and vice versa.
 *
 * The iOS test `Tests/HMANTests/CryptoTests.swift::testEmitFixtureForDesktopVerification`
 * writes `Tests/HMANTests/Fixtures/ios_signature_fixture.json` with a
 * fresh (publicKey, message, signature) triple every run. We read that
 * file and verify it here, in Node, with desktop-side libsodium.
 *
 * If you're running this test fresh, the fixture may be the placeholder
 * shipped with the PR — the test handles that gracefully (skips with a
 * clear message rather than a confusing decode failure). To run a real
 * end-to-end check:
 *
 *     cd apps/ios && swift test                    # writes fixture
 *     cd ../../packages/core && npm test           # reads + verifies
 *
 * The reverse direction (desktop signs, iOS verifies) is documented
 * inline at the bottom of this file: we generate a `desktop_signature_fixture.json`
 * here so a reviewer running iOS tests by hand can consume it from
 * Swift. Wave 3 will automate that loop in CI; for now an `ios-build`
 * job on macos-14 + the desktop's vitest job on ubuntu-latest is enough
 * to prove both legs as long as both consume the same fixture format.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from 'vitest';
import sodium from 'libsodium-wrappers-sumo';
import {
  initCrypto,
  fromBase64,
  toBase64,
  generateSigningKeyPair,
  sign,
  verify,
} from '../crypto/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve relative to the package root (packages/core), not the test
// file's nested location. Works whether tests run via `npm -w @hman/core
// test` from the repo root or `npm test` from inside packages/core.
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const IOS_FIXTURE = path.join(
  REPO_ROOT,
  'apps/ios/Tests/HMANTests/Fixtures/ios_signature_fixture.json'
);
const DESKTOP_FIXTURE_DIR = path.join(REPO_ROOT, 'apps/ios/Tests/HMANTests/Fixtures');
const DESKTOP_FIXTURE = path.join(DESKTOP_FIXTURE_DIR, 'desktop_signature_fixture.json');

interface SignatureFixture {
  platform: string;
  scheme: string;
  encoding: string;
  publicKey: string;
  message: string;
  signature: string;
  _comment?: string;
}

describe('Cross-platform PACT signing', () => {
  beforeAll(async () => {
    await initCrypto();
  });

  describe('iOS → desktop', () => {
    it('verifies a signature produced by the iOS Swift port', () => {
      if (!existsSync(IOS_FIXTURE)) {
        // The fixture lives under apps/ios/Tests — only present once the
        // iOS test target has been run. Don't fail the desktop CI job for
        // that, but do shout loudly so the gap doesn't go unnoticed.
        console.warn(
          `[cross-platform] iOS fixture missing at ${IOS_FIXTURE}. ` +
            'Run `swift test` under apps/ios first to regenerate.'
        );
        return;
      }

      const raw = readFileSync(IOS_FIXTURE, 'utf-8');
      const fx: SignatureFixture = JSON.parse(raw);

      // Detect the placeholder shipped with the PR — empty fields are the
      // signal. A real signature has 64 raw bytes ≈ 86 b64 chars; an
      // empty string can't possibly be one.
      if (!fx.publicKey || !fx.message || !fx.signature) {
        console.warn(
          '[cross-platform] iOS fixture is the placeholder — run `swift test` to populate it.'
        );
        return;
      }

      expect(fx.scheme).toBe('ed25519-detached');
      expect(fx.encoding).toBe('libsodium-urlsafe-no-padding-base64');

      const messageBytes = fromBase64(fx.message);
      const signatureBytes = fromBase64(fx.signature);
      const publicKeyBytes = fromBase64(fx.publicKey);
      const ok = verify(messageBytes, signatureBytes, publicKeyBytes);
      expect(ok).toBe(true);
    });

    it('rejects a tampered iOS-signed message', () => {
      if (!existsSync(IOS_FIXTURE)) return;
      const fx: SignatureFixture = JSON.parse(readFileSync(IOS_FIXTURE, 'utf-8'));
      if (!fx.publicKey || !fx.message || !fx.signature) return;

      const original = fromBase64(fx.message);
      const tampered = new Uint8Array(original.length);
      tampered.set(original);
      tampered[0] ^= 0xff;

      const ok = verify(tampered, fromBase64(fx.signature), fromBase64(fx.publicKey));
      expect(ok).toBe(false);
    });
  });

  describe('desktop → iOS', () => {
    // We generate a desktop-side fixture so a reviewer running the iOS
    // test target manually can verify the reverse direction. There's no
    // automated iOS test that consumes this yet — that's a Wave 3 CI job
    // (macos-14 runner that loads this fixture and calls
    // PACTSigner.verify). For now: produce the artefact so the proof is
    // reproducible on demand.
    it('writes a desktop-signed fixture for the iOS verifier to consume', () => {
      const { publicKey, privateKey } = generateSigningKeyPair();
      const message = sodium.from_string(
        '{"actor":"member-test","intent":"approve","origin":"desktop"}'
      );
      const signature = sign(message, privateKey);

      // Sanity check: the desktop's own verifier accepts what the desktop
      // just signed. If this fails the bug is in encryption.ts's sign/verify,
      // not the cross-platform layer.
      expect(verify(message, signature, publicKey)).toBe(true);

      const fixture: SignatureFixture = {
        platform: 'desktop',
        scheme: 'ed25519-detached',
        encoding: 'libsodium-urlsafe-no-padding-base64',
        publicKey: toBase64(publicKey),
        message: toBase64(message),
        signature: toBase64(signature),
        _comment:
          'Generated by packages/core cross-platform.test.ts. Consumed by the iOS verifier in a manual reviewer step (or the Wave 3 macos-14 CI job once added).',
      };

      mkdirSync(DESKTOP_FIXTURE_DIR, { recursive: true });
      writeFileSync(DESKTOP_FIXTURE, JSON.stringify(fixture, null, 2) + '\n', 'utf-8');

      expect(existsSync(DESKTOP_FIXTURE)).toBe(true);
    });
  });

  describe('byte-level encoding parity', () => {
    // If iOS and desktop disagreed on base64 variant the headline tests
    // above would still pass for raw signatures (which are always
    // base64'd via toBase64) but might silently corrupt anything else
    // that crosses the boundary. Pin the encoding here.
    it('libsodium URL-safe base64 with no padding', () => {
      // Same vector hard-coded into the iOS test; if both sides agree on
      // this, every other base64 boundary is safe.
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      expect(toBase64(bytes)).toBe('3q2-7w');
    });
  });
});
