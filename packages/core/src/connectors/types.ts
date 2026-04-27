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
 * Default Ollama-backed LLM client. Hits ``http://localhost:11434/api/chat``
 * with the model name caller specifies.  No retries, no streaming — the
 * connector's ``draft`` step is single-shot and small.
 */
export class OllamaLLMClient implements LLMClient {
  constructor(
    private readonly model: string = 'llama3.2:3b',
    private readonly endpoint: string = 'http://localhost:11434/api/chat',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async chat(input: {
    system: string;
    user: string;
    options?: Record<string, unknown>;
  }): Promise<string> {
    const res = await this.fetchImpl(this.endpoint, {
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
    });
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
