import OpenAI from 'openai';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { toJsonSchema, parseWithRepair } from './structured.js';

/**
 * The single OpenAI-compatible structured provider, owned by the engine because
 * BOTH consumers need it: the CI runner (the GitHub Action runs reviewer-core
 * directly) and the studio server's openrouter path. Centralizing it here means
 * session grouping, the no-choices guard, request timeouts, and the
 * parse-with-repair loop live in ONE place instead of being duplicated.
 *
 * OpenRouter is OpenAI-compatible, so we drive it with the OpenAI SDK pointed at
 * its baseURL. Only completeStructured is needed by reviewPullRequest; the rest
 * are stubs. Cost attribution is INJECTED (`estimateCost`) so the engine stays
 * free of a pricing table — the server passes its own, the runner passes none.
 */

const NOT_SUPPORTED = 'OpenRouterProvider only implements completeStructured';

/**
 * Calls are STREAMED. A non-streaming OpenRouter request is answered with
 * headers at once and its body kept open while the upstream generates, so the
 * SDK timeout (which stops at headers) never fires: a 67k-token review stalled
 * for 20+ minutes non-streaming, twice, yet streamed back in 74 s. Streaming
 * also lets us tell a stalled upstream (no chunks) from a slow but working one.
 */

/** Abort when no chunk (content OR reasoning) arrives for this long. */
const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

/** Hard wall-clock cap for one request, however steadily it streams. */
const DEFAULT_DEADLINE_MS = 600_000;

/**
 * Extra tries after a stall or deadline. OpenRouter routes each request to one
 * of several upstream providers; a retry is usually served by another.
 */
const STALL_RETRIES = 1;

/** The request body minus the streaming switches `streamCompletion` adds. */
type CompletionBody = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
  'stream' | 'stream_options'
>;

/** What a streamed completion adds up to. */
interface StreamedCompletion {
  content: string;
  /** At least one chunk carried a choice (else: upstream error / no output). */
  gotChoice: boolean;
  usage: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null;
  /** OpenRouter mid-stream error message, if any. */
  error: string | null;
}

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /** Abort a request that streams nothing for this long (default 120 s). */
  idleTimeoutMs?: number;
  /** Hard cap (ms) for one request (default 600 s); a request's `timeoutMs` overrides it. */
  deadlineMs?: number;
  /** Injected cost estimator; returns USD or null when the model is unknown. */
  estimateCost?: (model: string, tokensIn: number, tokensOut: number) => number | null;
}

export class OpenRouterProvider implements LLMProvider {
  readonly id: 'openai' | 'openrouter';
  private client: OpenAI;
  private baseURL: string;
  private apiKey: string;
  private estimateCost?: OpenRouterProviderOptions['estimateCost'];
  private deadlineMs: number;
  private idleTimeoutMs: number;

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.estimateCost = opts.estimateCost;
    this.deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseURL,
      timeout: opts.timeoutMs ?? 90_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = toJsonSchema(req.schema, req.schemaName);
    const maxRetries = req.maxRetries ?? 2;
    const messages = [...req.messages];
    let tokensIn = 0;
    let tokensOut = 0;
    let costFromApi: number | null = null;
    let lastRaw = '';

    const deadlineMs = req.timeoutMs ?? this.deadlineMs;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const body = {
        model: req.model,
        messages,
        temperature: req.temperature ?? 0,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
        },
        // OpenRouter session grouping — extra body field (spread is exempt from
        // excess-property checks). Only sent when talking to OpenRouter.
        ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
        // OpenRouter usage accounting — ask it to return the REAL generation
        // cost (USD) in `usage.cost`, instead of estimating from a price book.
        ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
      } satisfies CompletionBody;
      const res = await this.streamCompletion(body, deadlineMs, req);

      // OpenRouter can answer 200 with no choices (an upstream provider error /
      // moderation / free-tier limit in the body) — surface it.
      if (!res.gotChoice) {
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${res.error ? `: ${res.error}` : ''}`);
      }
      lastRaw = res.content;
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      if (typeof res.usage?.cost === 'number') costFromApi = (costFromApi ?? 0) + res.usage.cost;

      const parsed = parseWithRepair(req.schema, lastRaw);
      if (parsed.ok) {
        return {
          data: parsed.data,
          model: req.model,
          tokensIn,
          tokensOut,
          costUsd: costFromApi ?? this.estimateCost?.(req.model, tokensIn, tokensOut) ?? null,
          raw: lastRaw,
          attempts: attempt,
        };
      }
      messages.push({ role: 'assistant', content: lastRaw });
      messages.push({ role: 'user', content: parsed.repromptMessage });
    }
    throw new Error(`OpenRouter structured output failed schema validation for ${req.schemaName}`);
  }

  /**
   * One streamed chat completion. Aborts when nothing streams for
   * `idleTimeoutMs` (a stalled upstream) or the request outlives `deadlineMs`;
   * either is retried STALL_RETRIES time(s) before the call fails.
   */
  private async streamCompletion(
    body: CompletionBody,
    deadlineMs: number,
    req: { schemaName: string; model: string },
  ): Promise<StreamedCompletion> {
    const tries = 1 + STALL_RETRIES;
    for (let i = 1; ; i++) {
      const idle = new AbortController();
      const signal = AbortSignal.any([idle.signal, AbortSignal.timeout(deadlineMs)]);
      let timer = setTimeout(() => idle.abort(), this.idleTimeoutMs);
      const alive = () => {
        clearTimeout(timer);
        timer = setTimeout(() => idle.abort(), this.idleTimeoutMs);
      };
      try {
        const stream = await this.client.chat.completions.create(
          { ...body, stream: true, stream_options: { include_usage: true } },
          { signal },
        );
        const out: StreamedCompletion = { content: '', gotChoice: false, usage: null, error: null };
        for await (const chunk of stream) {
          alive(); // reasoning deltas count — the model is working
          const choice = chunk.choices?.[0];
          if (choice) {
            out.gotChoice = true;
            out.content += choice.delta?.content ?? '';
          }
          if (chunk.usage) out.usage = chunk.usage as StreamedCompletion['usage'];
          const err = (chunk as { error?: { message?: string } }).error;
          if (err) out.error = err.message ?? 'upstream error';
        }
        // On abort the SDK's stream iterator just STOPS (no throw) — so a
        // stalled call would otherwise look like an empty answer.
        if (!signal.aborted) return out;
      } catch (err) {
        if (!signal.aborted) throw err;
      } finally {
        clearTimeout(timer);
      }
      // Aborted (stall or deadline): retry, or give up with the reason.
      if (i >= tries) {
        const why = idle.signal.aborted
          ? `streamed nothing for ${this.idleTimeoutMs / 1000}s`
          : `exceeded its ${deadlineMs / 1000}s deadline`;
        throw new Error(`${this.id} ${req.schemaName} call ${why} ${tries} time(s) (model ${req.model})`);
      }
    }
  }

  /**
   * List models with pricing from the OpenRouter `/models` endpoint (the OpenAI
   * SDK's models.list strips the `pricing` field, so we fetch raw). Prices are
   * converted from per-token to USD per 1M tokens; cheapest output first.
   */
  async listModels(): Promise<ModelInfo[]> {
    const res = await fetch(`${this.baseURL}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
    const json = (await res.json()) as {
      data?: Array<{
        id: string;
        name?: string;
        context_length?: number;
        pricing?: { prompt?: string; completion?: string };
      }>;
    };
    const models: ModelInfo[] = (json.data ?? []).map((m) => {
      const prompt = Number(m.pricing?.prompt);
      const completion = Number(m.pricing?.completion);
      // OpenRouter uses -1 as a sentinel for variable-priced router pseudo-models
      // (openrouter/auto etc.) — treat negatives as "unknown" so they don't show
      // as $-1000000 and don't sort to the top of the cheapest list.
      const pricing =
        Number.isFinite(prompt) && Number.isFinite(completion) && prompt >= 0 && completion >= 0
          ? { promptPerM: prompt * 1_000_000, completionPerM: completion * 1_000_000 }
          : null;
      return {
        id: m.id,
        provider: 'openrouter' as const,
        label: m.name ?? null,
        pricing,
        contextLength: m.context_length ?? null,
      };
    });
    return models.sort(
      (a, b) => (a.pricing?.completionPerM ?? Infinity) - (b.pricing?.completionPerM ?? Infinity),
    );
  }
  async complete(_req: CompletionRequest): Promise<CompletionResult> {
    throw new Error(NOT_SUPPORTED);
  }
  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error(NOT_SUPPORTED);
  }
}
