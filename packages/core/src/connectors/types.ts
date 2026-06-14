/**
 * Connector helper types — small interfaces the impls inject so they
 * stay testable without external services.
 */

/**
 * Tiny LLM client interface. The default impl posts to a local Ollama
 * server, but tests inject stubs that return canned drafts. Keeping
 * this internal to the connectors module means we can swap the
 * platform-wide LLM abstraction in later without touching connector code.
 */
export interface LLMClient {
  /** Send a chat-style prompt and return the assistant text. */
  chat(input: {
    system: string;
    user: string;
    /** Free-form options passed straight to the underlying server. */
    options?: Record<string, unknown>;
  }): Promise<string>;
}

/**
 * Resolve the default Ollama chat endpoint from the environment.
 *
 * Precedence (mirrors the Python bridge's ``_resolve_llm_endpoint`` so both
 * runtimes point at the same box):
 *   1. ``HMAN_LLM_ENDPOINT`` — explicit full chat URL.
 *   2. ``HMAN_OLLAMA_URL``   — base URL the voice loop also reads; we append
 *      ``/api/chat`` so one var aims the whole stack at a single local
 *      inference box, e.g. an NVIDIA RTX/DGX Spark at
 *      ``http://spark.local:11434``.
 *   3. ``http://localhost:11434/api/chat`` — default.
 */
export function resolveOllamaEndpoint(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  const explicit = env.HMAN_LLM_ENDPOINT?.trim();
  if (explicit) return explicit;
  const base = env.HMAN_OLLAMA_URL?.trim();
  if (base) return `${base.replace(/\/+$/, '')}/api/chat`;
  return 'http://localhost:11434/api/chat';
}

/** Default chat model: ``HMAN_LLM_MODEL`` → ``HMAN_VOICE_MODEL`` → ``llama3.2:3b``. */
export function resolveOllamaModel(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): string {
  return env.HMAN_LLM_MODEL?.trim() || env.HMAN_VOICE_MODEL?.trim() || 'llama3.2:3b';
}

/**
 * Default Ollama request timeout in milliseconds; override via
 * ``HMAN_OLLAMA_TIMEOUT`` (seconds, mirroring the Python bridge). Generous by
 * default — the first request to a model cold-loads its weights into GPU
 * memory, which on a larger model / bigger box (RTX/DGX Spark) can exceed a
 * minute. ``fetch`` has no built-in timeout, so without this a stalled box
 * would hang the draft forever.
 */
export function resolveOllamaTimeoutMs(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): number {
  const raw = env.HMAN_OLLAMA_TIMEOUT?.trim();
  if (raw) {
    const secs = Number(raw);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  }
  return 120_000;
}

/**
 * Default Ollama-backed LLM client. Defaults the endpoint, model and timeout
 * from the environment (see {@link resolveOllamaEndpoint}) so it honours the
 * same ``HMAN_OLLAMA_URL`` the voice loop uses; pass explicit args to
 * override. No retries, no streaming — the connector's ``draft`` step is
 * single-shot and small.
 */
export class OllamaLLMClient implements LLMClient {
  private readonly model: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(
    model: string = resolveOllamaModel(),
    endpoint: string = resolveOllamaEndpoint(),
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = resolveOllamaTimeoutMs(),
  ) {
    this.model = model;
    this.endpoint = endpoint;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async chat(input: {
    system: string;
    user: string;
    options?: Record<string, unknown>;
  }): Promise<string> {
    // fetch has no built-in timeout — abort a stalled inference box rather
    // than hang the draft forever.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
          stream: false,
          options: input.options,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Ollama chat timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      throw new Error(`Ollama chat failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content?.trim() ?? '';
  }
}

/**
 * Tiny GitHub REST client interface. Tests inject a stub; the default
 * impl uses ``fetch`` against ``api.github.com``.
 *
 * Scope: only the verbs the connector actually needs. Adding more is
 * fine, but every method here must remain side-effect-light enough that
 * the receptivity gate's ``undo`` semantics still hold.
 */
export interface GitHubClient {
  createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
  }): Promise<{ number: number; html_url: string }>;

  /** Close an issue, posting an explanatory comment. Used by ``undo``. */
  closeIssue(input: {
    owner: string;
    repo: string;
    issue_number: number;
    comment?: string;
  }): Promise<void>;
}

/**
 * Default GitHub REST client. Reads the token from the environment by
 * default so tokens don't leak through ctor args. Pass an explicit
 * ``token`` for programmatic use; pass a custom ``fetchImpl`` for tests.
 */
export class FetchGitHubClient implements GitHubClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: {
    token?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}) {
    this.baseUrl = opts.baseUrl ?? 'https://api.github.com';
    // Read token lazily from env so tests can construct without setting it
    this.token = opts.token ?? process.env.HMAN_GITHUB_TOKEN ?? '';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private headers(): Record<string, string> {
    if (!this.token) {
      throw new Error(
        'HMAN_GITHUB_TOKEN not set — cannot call GitHub. Use a fine-grained PAT with issues:write on the whitelisted repo.',
      );
    }
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  async createIssue(input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
  }): Promise<{ number: number; html_url: string }> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ title: input.title, body: input.body }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub issue create failed: ${res.status} ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { number: number; html_url: string };
    return { number: data.number, html_url: data.html_url };
  }

  async closeIssue(input: {
    owner: string;
    repo: string;
    issue_number: number;
    comment?: string;
  }): Promise<void> {
    if (input.comment) {
      const commentRes = await this.fetchImpl(
        `${this.baseUrl}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues/${input.issue_number}/comments`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ body: input.comment }),
        },
      );
      if (!commentRes.ok) {
        const text = await commentRes.text();
        throw new Error(`GitHub issue comment failed: ${commentRes.status} ${text.slice(0, 200)}`);
      }
    }
    const res = await this.fetchImpl(
      `${this.baseUrl}/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/issues/${input.issue_number}`,
      {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ state: 'closed', state_reason: 'not_planned' }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub issue close failed: ${res.status} ${text.slice(0, 200)}`);
    }
  }
}
