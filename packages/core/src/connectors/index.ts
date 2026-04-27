/**
 * @hman/core/connectors — external action surface.
 *
 * Public API:
 *   - ``Connector`` — the base interface every external action implements.
 *   - ``Intention``, ``ExecutionResult``, ``PACTAttestation`` — wire shapes.
 *   - ``ReceptivityGate`` — thin TS shadow of the bridge's gate interface.
 *   - ``GitHubConnector`` — first concrete impl.
 *   - helpers: ``hashIntention``, ``signAttestation``, ``renderAttestationBlock``.
 */

export type {
  Connector,
  Intention,
  ExecutionResult,
  PACTAttestation,
  ReceptivityGate,
  GateDecision,
} from './Connector.js';

export {
  GitHubConnector,
  hashIntention,
  renderAttestationBlock,
  signAttestation,
  parseDraftReply,
  type GitHubIssuePayload,
  type GitHubConnectorConfig,
} from './github.js';

export {
  OllamaLLMClient,
  FetchGitHubClient,
  type LLMClient,
  type GitHubClient,
} from './types.js';
