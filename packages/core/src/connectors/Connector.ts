/**
 * HMAN Connector — base interface for every external action HMAN takes
 * on a member's behalf.
 *
 * The contract is the load-bearing piece: every future connector (Bank,
 * Tailor, Calendar, email, Slack, …) implements this same shape so the
 * receptivity gate, consent UI, audit log, and undo path can treat them
 * uniformly.
 *
 * Lifecycle of a single external action:
 *
 *   1. ``draft({ context })`` — the subconscious has noticed a moment
 *      where an external action might be useful. The connector turns
 *      free-form context (e.g. a transcript snippet) into a structured
 *      ``Intention`` with a typed payload.
 *
 *   2. The bridge stores the Intention in the vault keyed by ``id`` and
 *      hands it to the receptivity gate. The gate decides *when* and
 *      *how* to surface the consent moment (voice / text / queue).
 *
 *   3. The member consents through the chosen channel. The bridge signs
 *      a ``PACTAttestation`` over the intention hash + member ID + the
 *      channel that was actually used + the timestamp.
 *
 *   4. ``execute(intention, attestation)`` — the connector performs the
 *      external action, embedding the attestation alongside it so the
 *      artifact (the GitHub issue, the bank transfer reference, …) is
 *      verifiably an authorized member action.
 *
 *   5. ``undo?(result)`` — optional. Issues yes (low blast radius),
 *      payments no. Each connector decides.
 */

/**
 * PACT attestation — the proof a connector embeds alongside the
 * external action to make it verifiable.
 *
 * This shape is intentionally a plain JSON-serialisable object so it
 * can be embedded inside an issue body, a bank-transfer reference, an
 * email header, etc. without any platform-specific binary plumbing.
 *
 * NOTE: this is the *envelope*. The PACT spec lives in the separate
 * ``protocol/pact/`` repo — when that pins the canonical wire format
 * we'll narrow this type. For now we mirror the fields every consumer
 * needs to verify the action.
 */
export interface PACTAttestation {
  /** Stable member identifier (anonymised hash, never PII). */
  memberId: string;
  /** Hash of the canonical Intention bytes the member consented to. */
  intentionHash: string;
  /** Channel through which consent was actually obtained. */
  channel: 'voice' | 'text' | 'queue';
  /** ISO-8601 timestamp the member said yes. */
  timestamp: string;
  /** Ed25519 public key of the signer (base64). */
  publicKey: string;
  /** Ed25519 signature over a canonical serialisation of the fields above (base64). */
  signature: string;
}

/**
 * Intention — what HMAN is *thinking about* doing, before consent.
 *
 * ``TPayload`` is the connector-specific shape the action needs. For
 * GitHub it's ``{ owner, repo, title, body }``; for a bank transfer it
 * would be ``{ payeePayId, amount, currency, reference }``.
 */
export interface Intention<TPayload = unknown> {
  /** Stable id (uuid) — the same value gates, consent UI and audit all use. */
  id: string;
  /** Connector name, e.g. ``"github"``, ``"bank"``. */
  connector: string;
  /** Action verb the connector understands, e.g. ``"issue.create"``. */
  action: string;
  /** Connector-specific payload. */
  payload: TPayload;
  /** Member-facing one-line description for the consent surface. */
  description: string;
  /** Urgency in [0, 1] — fed to the receptivity gate. */
  urgency: number;
  /**
   * Free-form context (transcript snippet, screenshot OCR, …) that
   * informed the draft. Kept so the consent prompt can quote the
   * member's own words back to them.
   */
  context?: string;
  /** ISO-8601 timestamp the draft was produced. */
  draftedAt: string;
}

/** What a connector returns after attempting to execute. */
export interface ExecutionResult {
  /** True if the external service confirmed the action. */
  success: boolean;
  /** Human-visible URL of the resulting artifact, when there is one. */
  artifactUrl?: string;
  /** A stable id the connector can use to ``undo`` later (e.g. issue number). */
  artifactId?: string;
  /** The attestation that was embedded — caller persists this in the audit. */
  attestation: PACTAttestation;
  /** Populated only when ``success`` is false. */
  error?: string;
}

/**
 * Receptivity-gate interface every connector imports.
 *
 * The canonical implementation lives in the Python bridge at
 * ``packages/python-bridge/receptivity/`` (PR #5). This thin TypeScript
 * shadow lets the TS connector code remain decoupled — any caller can
 * inject either the live REST-backed gate or a stub for tests. When
 * #4 lands and we settle on a canonical TS port we'll re-export from
 * that module instead.
 */
export interface ReceptivityGate {
  /**
   * Ask the gate whether to surface the intention right now and on which
   * channel.  The gate is the only thing that decides — the connector
   * never surfaces itself.
   */
  evaluate(intention: Intention): Promise<GateDecision>;
}

/** Mirror of the Python ``GateDecision`` returned by ``/api/receptivity/evaluate``. */
export interface GateDecision {
  surfaceNow: boolean;
  channel: 'voice' | 'text' | 'queue';
  reason: string;
  score: number;
  budgetWordsRemaining: number;
  budgetInterruptionsToday: number;
}

/**
 * Connector — every external action HMAN takes implements this.
 */
export interface Connector<TPayload = unknown> {
  /** Stable connector id, e.g. ``"github"``. */
  readonly name: string;

  /**
   * Turn free-form context into a typed Intention. The connector is
   * responsible for filling out a useful ``description`` — that's the
   * line the member will hear or read at the consent moment.
   */
  draft(input: { context: string; memberId?: string }): Promise<Intention<TPayload>>;

  /**
   * Perform the external action and embed the attestation alongside.
   * Returns success metadata or a structured error — never throws on
   * expected failure paths (network, auth, rate-limit).
   */
  execute(intention: Intention<TPayload>, attestation: PACTAttestation): Promise<ExecutionResult>;

  /**
   * Optional — reverse a previous execution. Connectors with low blast
   * radius (issues, calendar invites, draft emails) implement this;
   * irreversible ones (payments) do not.
   */
  undo?(result: ExecutionResult): Promise<void>;
}
