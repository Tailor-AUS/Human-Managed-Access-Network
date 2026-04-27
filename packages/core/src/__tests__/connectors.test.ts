/**
 * Connector tests — every behavior the contract promises:
 *  - draft turns context into a typed Intention
 *  - hashIntention is deterministic
 *  - signAttestation produces a verifiable Ed25519 signature
 *  - execute embeds the attestation block in the issue body
 *  - execute rejects mismatched attestations and disallowed repos
 *  - undo closes the issue with a comment
 *  - LLM stub fallback survives malformed model output
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  GitHubConnector,
  hashIntention,
  parseDraftReply,
  renderAttestationBlock,
  signAttestation,
} from '../connectors/github.js';
import type { GitHubClient, LLMClient } from '../connectors/types.js';
import type { Intention, PACTAttestation } from '../connectors/Connector.js';

class StubLLM implements LLMClient {
  constructor(private readonly reply: string) {}
  async chat(): Promise<string> {
    return this.reply;
  }
}

class StubGitHub implements GitHubClient {
  public lastCreate: { owner: string; repo: string; title: string; body: string } | undefined;
  public lastClose: { owner: string; repo: string; issue_number: number; comment?: string } | undefined;
  constructor(
    private readonly createResult: { number: number; html_url: string } = {
      number: 42,
      html_url: 'https://github.com/example/repo/issues/42',
    },
    private readonly throwOnCreate: Error | null = null,
  ) {}
  async createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
  }): Promise<{ number: number; html_url: string }> {
    if (this.throwOnCreate) throw this.throwOnCreate;
    this.lastCreate = input;
    return this.createResult;
  }
  async closeIssue(input: {
    owner: string;
    repo: string;
    issue_number: number;
    comment?: string;
  }): Promise<void> {
    this.lastClose = input;
  }
}

function freshKeypair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
}

describe('hashIntention', () => {
  const base: Intention<unknown> = {
    id: 'i1',
    connector: 'github',
    action: 'issue.create',
    payload: { owner: 'a', repo: 'b', title: 't', body: 'b' },
    description: 'desc',
    urgency: 0.3,
    context: 'ctx',
    draftedAt: '2026-04-26T00:00:00.000Z',
  };

  it('is deterministic across runs', () => {
    expect(hashIntention(base)).toBe(hashIntention({ ...base }));
  });

  it('changes when payload changes', () => {
    const other = { ...base, payload: { ...(base.payload as object), title: 't2' } };
    expect(hashIntention(other)).not.toBe(hashIntention(base));
  });

  it('treats missing context as null, not absent', () => {
    const a = hashIntention({ ...base, context: undefined });
    const b = hashIntention({ ...base, context: undefined });
    expect(a).toBe(b);
  });
});

describe('signAttestation', () => {
  it('produces a verifiable Ed25519 signature', () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const intention: Intention<unknown> = {
      id: 'i1',
      connector: 'github',
      action: 'issue.create',
      payload: { owner: 'a', repo: 'b', title: 't', body: 'b' },
      description: 'd',
      urgency: 0.3,
      draftedAt: '2026-04-26T00:00:00.000Z',
    };
    const att = signAttestation({
      intention,
      memberId: 'member-abc',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
      timestamp: '2026-04-26T01:00:00.000Z',
    });

    // Re-construct the canonical bytes the signer committed to.
    const canonical = JSON.stringify({
      memberId: 'member-abc',
      intentionHash: hashIntention(intention),
      channel: 'voice',
      timestamp: '2026-04-26T01:00:00.000Z',
    });
    // Ed25519 verification: crypto.verify with algorithm=null.
    const publicKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem' });
    const ok = crypto.verify(
      null,
      Buffer.from(canonical, 'utf8'),
      publicKey,
      Buffer.from(att.signature, 'base64'),
    );
    expect(ok).toBe(true);

    // Public key round-trips.
    const decodedPem = Buffer.from(att.publicKey, 'base64').toString('utf8');
    expect(decodedPem).toBe(publicKeyPem);
  });
});

describe('renderAttestationBlock', () => {
  it('renders a collapsed details block with JSON inside', () => {
    const att: PACTAttestation = {
      memberId: 'm',
      intentionHash: 'h',
      channel: 'text',
      timestamp: '2026-04-26T00:00:00.000Z',
      publicKey: 'pk',
      signature: 'sig',
    };
    const out = renderAttestationBlock(att);
    expect(out).toContain('<details>');
    expect(out).toContain('<summary>HMAN PACT attestation</summary>');
    expect(out).toContain('"memberId": "m"');
    expect(out).toContain('"channel": "text"');
  });
});

describe('parseDraftReply', () => {
  it('parses well-formed JSON reply', () => {
    const reply = '{"title":"Fix Muse handshake","body":"## Context\\n\\n> handshake fails"}';
    const out = parseDraftReply(reply, 'whatever');
    expect(out.title).toBe('Fix Muse handshake');
    expect(out.body).toContain('handshake fails');
  });

  it('extracts JSON when LLM wraps it in prose', () => {
    const reply = 'Sure, here is the draft:\n{"title":"X","body":"Y"}\nLet me know if you want changes.';
    const out = parseDraftReply(reply, 'ctx');
    expect(out.title).toBe('X');
  });

  it('falls back to a stub when the reply is unparseable', () => {
    const out = parseDraftReply('garbage with no JSON at all', 'the muse handshake is annoying');
    expect(out.title.length).toBeGreaterThan(0);
    expect(out.body).toContain('the muse handshake is annoying');
  });

  it('truncates very long stub titles', () => {
    const ctx = 'a'.repeat(200);
    const out = parseDraftReply('not json', ctx);
    expect(out.title.length).toBeLessThanOrEqual(70);
  });
});

describe('GitHubConnector.draft', () => {
  it('returns an Intention with the LLM draft', async () => {
    const llm = new StubLLM('{"title":"Fix Muse handshake","body":"It fails."}');
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm,
      github: new StubGitHub(),
      now: () => new Date('2026-04-26T00:00:00.000Z'),
    });
    const intention = await c.draft({ context: 'this Muse handshake is annoying' });
    expect(intention.connector).toBe('github');
    expect(intention.action).toBe('issue.create');
    expect(intention.payload.title).toBe('Fix Muse handshake');
    expect(intention.payload.owner).toBe('example');
    expect(intention.payload.repo).toBe('repo');
    expect(intention.urgency).toBeGreaterThan(0);
    expect(intention.urgency).toBeLessThanOrEqual(1);
    expect(intention.draftedAt).toBe('2026-04-26T00:00:00.000Z');
    expect(intention.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
});

describe('GitHubConnector.execute', () => {
  it('embeds the attestation block in the issue body and returns artifactUrl', async () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const stub = new StubGitHub();
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm: new StubLLM('{"title":"X","body":"Y"}'),
      github: stub,
    });
    const intention = await c.draft({ context: 'something broke' });
    const att = signAttestation({
      intention,
      memberId: 'member-abc',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
    });
    const result = await c.execute(intention, att);
    expect(result.success).toBe(true);
    expect(result.artifactUrl).toBe('https://github.com/example/repo/issues/42');
    expect(result.artifactId).toBe('example/repo#42');
    expect(stub.lastCreate?.body).toContain('<details>');
    expect(stub.lastCreate?.body).toContain('HMAN PACT attestation');
    expect(stub.lastCreate?.body).toContain(att.signature);
  });

  it('refuses if the attestation hash does not match the intention', async () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm: new StubLLM('{"title":"A","body":"B"}'),
      github: new StubGitHub(),
    });
    const intention = await c.draft({ context: 'ctx' });
    const evilIntention = { ...intention, payload: { ...intention.payload, title: 'tampered' } };
    const att = signAttestation({
      intention,
      memberId: 'm',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
    });
    const result = await c.execute(evilIntention, att);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hash mismatch/);
  });

  it('refuses if owner/repo is not whitelisted', async () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      allowedRepos: [{ owner: 'allowed', repo: 'thing' }],
      llm: new StubLLM('{"title":"A","body":"B"}'),
      github: new StubGitHub(),
    });
    const intention = await c.draft({ context: 'ctx' });
    const att = signAttestation({
      intention,
      memberId: 'm',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
    });
    const result = await c.execute(intention, att);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/whitelist/);
  });

  it('returns structured error on REST failure rather than throwing', async () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const stub = new StubGitHub({ number: 1, html_url: 'x' }, new Error('rate-limited'));
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm: new StubLLM('{"title":"A","body":"B"}'),
      github: stub,
    });
    const intention = await c.draft({ context: 'ctx' });
    const att = signAttestation({
      intention,
      memberId: 'm',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
    });
    const result = await c.execute(intention, att);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/rate-limited/);
  });
});

describe('GitHubConnector.undo', () => {
  it('closes the issue with a rescinded comment', async () => {
    const { privateKeyPem, publicKeyPem } = freshKeypair();
    const stub = new StubGitHub();
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm: new StubLLM('{"title":"A","body":"B"}'),
      github: stub,
    });
    const intention = await c.draft({ context: 'ctx' });
    const att = signAttestation({
      intention,
      memberId: 'm',
      channel: 'voice',
      privateKeyPem,
      publicKeyPem,
    });
    const result = await c.execute(intention, att);
    await c.undo!(result);
    expect(stub.lastClose).toBeDefined();
    expect(stub.lastClose?.owner).toBe('example');
    expect(stub.lastClose?.repo).toBe('repo');
    expect(stub.lastClose?.issue_number).toBe(42);
    expect(stub.lastClose?.comment).toMatch(/rescinded/);
  });

  it('is a no-op on an unsuccessful result', async () => {
    const stub = new StubGitHub();
    const c = new GitHubConnector({
      defaultOwner: 'example',
      defaultRepo: 'repo',
      llm: new StubLLM('{"title":"A","body":"B"}'),
      github: stub,
    });
    await c.undo!({
      success: false,
      attestation: {
        memberId: 'm',
        intentionHash: 'h',
        channel: 'voice',
        timestamp: 't',
        publicKey: 'pk',
        signature: 'sig',
      },
    });
    expect(stub.lastClose).toBeUndefined();
  });
});
