/**
 * Cost attribution in OpenRouterProvider.completeStructured (L01 run cost).
 * The persisted run cost must be OpenRouter's REAL `usage.cost` when present;
 * the injected price-book estimate is only a fallback, and unknown stays null.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ ok: z.boolean() });

/** Provider whose OpenAI client streams one canned completion (no network). */
function providerWith(usage: Record<string, number>, estimate?: number | null) {
  const p = new OpenRouterProvider('test-key', {
    ...(estimate !== undefined ? { estimateCost: () => estimate } : {}),
  });
  async function* chunks() {
    yield { choices: [{ delta: { content: '{"ok":' } }] };
    yield { choices: [{ delta: { content: 'true}' } }] };
    // OpenRouter sends usage (incl. `cost`) on a final chunk with no choices.
    yield { choices: [], usage };
  }
  (p as unknown as { client: unknown }).client = {
    chat: { completions: { create: async () => chunks() } },
  };
  return p;
}

const req = {
  model: 'deepseek/deepseek-v4-flash',
  schema: Schema,
  schemaName: 'Probe',
  messages: [{ role: 'user' as const, content: 'hi' }],
};

describe('OpenRouterProvider cost attribution', () => {
  it('prefers the real usage.cost over the price-book estimate', async () => {
    const res = await providerWith({ prompt_tokens: 9000, completion_tokens: 119, cost: 0.0013 }, 0.5).completeStructured(req);
    expect(res.costUsd).toBe(0.0013);
    expect(res.tokensIn).toBe(9000);
    expect(res.tokensOut).toBe(119);
  });

  it('falls back to the injected estimate when usage.cost is absent', async () => {
    const res = await providerWith({ prompt_tokens: 10, completion_tokens: 5 }, 0.0021).completeStructured(req);
    expect(res.costUsd).toBe(0.0021);
  });

  it('is null (unknown, not $0) with neither usage.cost nor an estimate', async () => {
    const res = await providerWith({ prompt_tokens: 10, completion_tokens: 5 }).completeStructured(req);
    expect(res.costUsd).toBeNull();
  });
});
