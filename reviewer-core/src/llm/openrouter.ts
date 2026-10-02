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

/** Default wall-clock budget for one LLM request. */
const DEFAULT_DEADLINE_MS = 240_000;

/**
 * Extra tries after a deadline. OpenRouter routes each request to one of
 * several upstream providers; a stalled one is the usual cause, and a retry
 * is usually served by another (the same 67k-token review that stalled for 20+
 * minutes streamed back in 74 s on a different provider).
 */
const DEADLINE_RETRIES = 1;

export interface OpenRouterProviderOptions {
  /** OpenAI-compatible base URL (default: OpenRouter). */
  baseURL?: string;
  /** Provider id for traces/gating (default 'openrouter'). */
  id?: 'openai' | 'openrouter';
  /** Per-request timeout (ms) — the SDK retries on timeout/5xx/429 with backoff. */
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * Wall-clock deadline (ms) for one request, SDK retries included; a request
   * that hits it is retried once before the call fails.
   * Needed because the SDK `timeout` stops counting once response headers
   * arrive, and OpenRouter answers a long non-streaming request at once and
   * keeps the body open (whitespace) while the model generates — a huge PR
   * review hung for 20+ minutes. A request's `timeoutMs` overrides it.
   */
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

  constructor(apiKey: string, opts: OpenRouterProviderOptions = {}) {
    this.id = opts.id ?? 'openrouter';
    this.apiKey = apiKey;
    this.baseURL = opts.baseURL ?? 'https://openrouter.ai/api/v1';
    this.estimateCost = opts.estimateCost;
    this.deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
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
          type: 'json_schema' as const,
          json_schema: { name: req.schemaName, schema: jsonSchema.schema, strict: true },
        },
        // OpenRouter session grouping — extra body field (spread is exempt from
        // excess-property checks). Only sent when talking to OpenRouter.
        ...(this.id === 'openrouter' && req.sessionId ? { session_id: req.sessionId } : {}),
        // OpenRouter usage accounting — ask it to return the REAL generation
        // cost (USD) in `usage.cost`, instead of estimating from a price book.
        ...(this.id === 'openrouter' ? { usage: { include: true } } : {}),
      };
      const res = await this.createWithDeadline(body, deadlineMs, req);

      // OpenRouter can return HTTP 200 with no `choices` (an upstream provider
      // error / moderation / free-tier limit in the body) — surface it.
      const choice = res.choices?.[0];
      if (!choice) {
        const errMsg = (res as unknown as { error?: { message?: string } }).error?.message;
        throw new Error(`OpenRouter returned no choices for ${req.schemaName}${errMsg ? `: ${errMsg}` : ''}`);
      }
      lastRaw = choice.message?.content ?? '';
      tokensIn += res.usage?.prompt_tokens ?? 0;
      tokensOut += res.usage?.completion_tokens ?? 0;
      // `usage.cost` is an OpenRouter extension (USD), absent from the OpenAI SDK type.
      const apiCost = (res.usage as { cost?: number } | null | undefined)?.cost;
      if (typeof apiCost === 'number') costFromApi = (costFromApi ?? 0) + apiCost;

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
   * One chat completion under a wall-clock deadline. Unlike the SDK timeout,
   * the AbortSignal also aborts reading a body that never completes. A request
   * that hits the deadline is retried (DEADLINE_RETRIES) before giving up.
   */
  private async createWithDeadline(
    body: Parameters<OpenAI['chat']['completions']['create']>[0],
    deadlineMs: number,
    req: { schemaName: string; model: string },
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    const tries = 1 + DEADLINE_RETRIES;
    for (let i = 1; ; i++) {
      const signal = AbortSignal.timeout(deadlineMs);
      try {
        return (await this.client.chat.completions.create(
          { ...body, stream: false },
          { signal },
        )) as OpenAI.Chat.Completions.ChatCompletion;
      } catch (err) {
        if (!signal.aborted) throw err;
        if (i >= tries) {
          throw new Error(
            `${this.id} ${req.schemaName} call exceeded its ${deadlineMs / 1000}s deadline ` +
              `${tries} time(s) (model ${req.model})`,
          );
        }
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
