/**
 * GitHubConnector — first concrete implementation of the Connector contract.
 *
 * Flow:
 *   1. ``draft({ context })`` — call the LLM to turn a transcript snippet
 *      into ``{ title, body }``, packaged as an Intention.
 *   2. ``execute(intention, attestation)`` — embed the attestation in a
 *      collapsed ``<details>`` block at the bottom of the issue body and
 *      POST to the GitHub REST API.
 *   3. ``undo(result)`` — close the issue with a "rescinded by member"
 *      comment.  Issues are low blast radius so undo is safe.
 */

import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  Connector,
  ExecutionResult,
  Intention,
  PACTAttestation,
} from './Connector.js';
import {
  FetchGitHubClient,
  OllamaLLMClient,
  type GitHubClient,
  type LLMClient,
} from './types.js';

/** Payload shape the GitHub connector hands GitHub's REST API. */
export interface GitHubIssuePayload {
  owner: string;
  repo: string;
  title: string;
  body: string;
}

export interface GitHubConnectorConfig {
  /** Default repo to file against when the LLM doesn't pick one. */
  defaultOwner: string;
  defaultRepo: string;
  /** Optional whitelist — execute throws if owner/repo isn't in this list. */
  allowedRepos?: ReadonlyArray<{ owner: string; repo: string }>;
  /** Injected for testing; defaults to Ollama on localhost:11434. */
  llm?: LLMClient;
  /** Injected for testing; defaults to fetch against api.github.com. */
  github?: GitHubClient;
  /** Override clock for tests. */
  now?: () => Date;
}

/**
 * Compute the canonical hash a PACT signature should cover for an
 * Intention. Must be deterministic — every party that re-derives the
 * hash from the same Intention object gets the same value.
 */
export function hashIntention(intention: Intention<unknown>): string {
  // Stable key order so JSON.stringify is deterministic across runs.
  const stable = {
    id: intention.id,
    connector: intention.connector,
    action: intention.action,
    payload: intention.payload,
    description: intention.description,
    urgency: intention.urgency,
    context: intention.context ?? null,
    draftedAt: intention.draftedAt,
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

/** Render a PACT attestation as a collapsed Markdown block. */
export function renderAttestationBlock(attestation: PACTAttestation): string {
  // Pretty JSON inside the fence so a human reader can eyeball the fields.
  const json = JSON.stringify(attestation, null, 2);
  return [
    '',
    '<!-- HMAN PACT attestation — verifies this issue was an authorized member action. -->',
    '<details>',
    '<summary>HMAN PACT attestation</summary>',
    '',
    '```json',
    json,
    '```',
    '',
    '_Verify this signature with the public key above against the canonical hash of the issue payload._',
    '</details>',
  ].join('\n');
}

/**
 * Sign an Intention as a PACT attestation. The signing keypair lives
 * outside this module — pass either a base64 Ed25519 secret key plus
 * its public key, or a complete pre-built ``PACTAttestation`` shape.
 *
 * This helper exists so the bridge can call ``execute`` with the same
 * canonical attestation shape every connector embeds.
 */
export function signAttestation(input: {
  intention: Intention<unknown>;
  memberId: string;
  channel: 'voice' | 'text' | 'queue';
  privateKeyPem: string;
  publicKeyPem: string;
  timestamp?: string;
}): PACTAttestation {
  const intentionHash = hashIntention(input.intention);
  const timestamp = input.timestamp ?? new Date().toISOString();
  // Canonical bytes the signature commits to.
  const canonical = JSON.stringify({
    memberId: input.memberId,
    intentionHash,
    channel: input.channel,
    timestamp,
  });
  // Ed25519 in node 17+ uses the one-shot crypto.sign with algorithm=null
  // (Ed25519 takes the message directly, not a digest).
  const privateKey = crypto.createPrivateKey({ key: input.privateKeyPem, format: 'pem' });
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  // Encode the public key as base64 of the raw PEM contents so it
  // round-trips cleanly inside JSON. Verifiers re-import with
  // ``crypto.createPublicKey({ key: pem, format: 'pem' })``.
  const publicKey = Buffer.from(input.publicKeyPem, 'utf8').toString('base64');
  return {
    memberId: input.memberId,
    intentionHash,
    channel: input.channel,
    timestamp,
    publicKey,
    signature,
  };
}

const DRAFT_SYSTEM_PROMPT = `You are HMAN's drafting subconscious. The member casually mentioned a bug or feature request in conversation. Turn what they said into a concise, actionable GitHub issue.

Output ONLY a JSON object on a single line with two keys: "title" and "body".

Rules:
- "title" is under 70 chars, imperative mood, no trailing period.
- "body" is plain Markdown. Open with one sentence stating the problem or request from the member's point of view, then a short "## Context" section quoting their actual words verbatim.
- Don't fabricate symptoms, error messages, or stack traces the member didn't say.
- Don't add labels, milestones, or assignees — the LLM does NOT auto-categorize.
- Don't include any HMAN attestation block — that's appended separately.`;

export class GitHubConnector implements Connector<GitHubIssuePayload> {
  readonly name = 'github';

  private readonly defaultOwner: string;
  private readonly defaultRepo: string;
  private readonly allowedRepos?: ReadonlyArray<{ owner: string; repo: string }>;
  private readonly llm: LLMClient;
  private readonly github: GitHubClient;
  private readonly now: () => Date;

  constructor(config: GitHubConnectorConfig) {
    this.defaultOwner = config.defaultOwner;
    this.defaultRepo = config.defaultRepo;
    this.allowedRepos = config.allowedRepos;
    this.llm = config.llm ?? new OllamaLLMClient();
    this.github = config.github ?? new FetchGitHubClient();
    this.now = config.now ?? (() => new Date());
  }

  async draft(input: { context: string; memberId?: string }): Promise<Intention<GitHubIssuePayload>> {
    const reply = await this.llm.chat({
      system: DRAFT_SYSTEM_PROMPT,
      user: input.context,
      options: { temperature: 0.2 },
    });
    const { title, body } = parseDraftReply(reply, input.context);
    const intention: Intention<GitHubIssuePayload> = {
      id: uuidv4(),
      connector: this.name,
      action: 'issue.create',
      payload: {
        owner: this.defaultOwner,
        repo: this.defaultRepo,
        title,
        body,
      },
      description: `File a GitHub issue: "${title}"`,
      // Bug reports in casual conversation are almost never urgent —
      // start low and let the member upgrade later.
      urgency: 0.3,
      context: input.context,
      draftedAt: this.now().toISOString(),
    };
    return intention;
  }

  async execute(
    intention: Intention<GitHubIssuePayload>,
    attestation: PACTAttestation,
  ): Promise<ExecutionResult> {
    // Cross-check: the attestation must commit to *this* intention.
    const expected = hashIntention(intention);
    if (attestation.intentionHash !== expected) {
      return {
        success: false,
        attestation,
        error: `attestation/intention hash mismatch (expected ${expected}, got ${attestation.intentionHash})`,
      };
    }

    const { owner, repo, title, body } = intention.payload;

    if (this.allowedRepos && !this.allowedRepos.some((r) => r.owner === owner && r.repo === repo)) {
      return {
        success: false,
        attestation,
        error: `repo ${owner}/${repo} not in allowedRepos whitelist`,
      };
    }

    const composedBody = `${body.trim()}\n\n${renderAttestationBlock(attestation)}\n`;

    try {
      const issue = await this.github.createIssue({ owner, repo, title, body: composedBody });
      return {
        success: true,
        artifactUrl: issue.html_url,
        artifactId: `${owner}/${repo}#${issue.number}`,
        attestation,
      };
    } catch (e) {
      return {
        success: false,
        attestation,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async undo(result: ExecutionResult): Promise<void> {
    if (!result.success || !result.artifactId) return;
    // artifactId format: "owner/repo#number"
    const match = /^([^/]+)\/([^#]+)#(\d+)$/.exec(result.artifactId);
    if (!match) {
      throw new Error(`cannot parse artifactId for undo: ${result.artifactId}`);
    }
    const [, owner, repo, num] = match;
    await this.github.closeIssue({
      owner,
      repo,
      issue_number: Number(num),
      comment:
        'Closed by HMAN: member rescinded consent for this action. ' +
        'Original PACT attestation in the issue body remains valid history.',
    });
  }
}

/**
 * Parse the LLM's reply into ``{ title, body }``. The LLM is asked for
 * a single-line JSON object but real models leak prose around it; this
 * extracts the first JSON object and falls back to a stub-issue using
 * the raw context if parsing fails.
 */
export function parseDraftReply(
  reply: string,
  context: string,
): { title: string; body: string } {
  // Find the first { ... } JSON-shaped substring.
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    const slice = reply.slice(start, end + 1);
    try {
      const parsed = JSON.parse(slice) as { title?: unknown; body?: unknown };
      const title = typeof parsed.title === 'string' && parsed.title.trim().length > 0
        ? parsed.title.trim().slice(0, 120)
        : null;
      const body = typeof parsed.body === 'string' && parsed.body.trim().length > 0
        ? parsed.body.trim()
        : null;
      if (title && body) return { title, body };
    } catch {
      // fall through to stub
    }
  }
  // Stub fallback — better to file *something* than to silently drop
  // the member's context. Title is a truncation, body quotes them.
  const trimmed = context.trim().replace(/\s+/g, ' ');
  const title = trimmed.length > 70 ? trimmed.slice(0, 67) + '...' : trimmed || 'Untitled issue from voice draft';
  const body = `## Context\n\n> ${trimmed || '(no context captured)'}\n\n_Drafted by HMAN — the LLM did not return a structured response, so this is a verbatim quote of the member's words._`;
  return { title, body };
}
