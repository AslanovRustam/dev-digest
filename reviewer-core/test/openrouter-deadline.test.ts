/**
 * OpenRouterProvider streams every call so a stalled upstream cannot hang a
 * review. Non-streaming, OpenRouter answers with headers at once and keeps the
 * body open while the model generates, and the SDK timeout stops at headers —
 * a PR review hung for 20+ minutes. These tests drive the real SDK against
 * local HTTP servers that mimic each upstream behaviour.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ ok: z.boolean() });
const servers: Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

/** A local server; `hits` counts requests so retries are observable. */
async function serve(handle: (res: ServerResponse) => void): Promise<{ url: string; hits: () => number }> {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    handle(res);
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits: () => hits };
}

const sse = (res: ServerResponse, data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

/** Keeps the connection open while sending only SSE comments (OpenRouter's "processing" keep-alive). */
function stalled(res: ServerResponse) {
  const t = setInterval(() => res.write(': OPENROUTER PROCESSING\n\n'), 50);
  res.on('close', () => clearInterval(t));
}

/** Streams reasoning deltas forever — working, but never finishing. */
function thinkingForever(res: ServerResponse) {
  const t = setInterval(() => sse(res, { choices: [{ delta: { reasoning: '.' } }] }), 50);
  res.on('close', () => clearInterval(t));
}

const call = (p: OpenRouterProvider, timeoutMs?: number) =>
  p.completeStructured({
    model: 'm',
    schema: Schema,
    schemaName: 'Probe',
    messages: [{ role: 'user', content: 'hi' }],
    maxRetries: 0,
    ...(timeoutMs ? { timeoutMs } : {}),
  });

describe('OpenRouterProvider streaming guards', () => {
  it('aborts an upstream that streams nothing, retries once, then fails clearly', async () => {
    const s = await serve(stalled);
    // The SDK timeout (200 ms) alone would never end this call.
    const p = new OpenRouterProvider('k', { baseURL: s.url, timeoutMs: 200, maxRetries: 0, idleTimeoutMs: 400 });
    const started = Date.now();
    await expect(call(p)).rejects.toThrow(/Probe call streamed nothing for 0\.4s 2 time\(s\)/);
    expect(s.hits()).toBe(2);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('keeps a call alive while reasoning streams, but caps it at the deadline', async () => {
    const s = await serve(thinkingForever);
    const p = new OpenRouterProvider('k', { baseURL: s.url, maxRetries: 0, idleTimeoutMs: 200, deadlineMs: 60_000 });
    // Per-call timeoutMs overrides the provider deadline.
    await expect(call(p, 700)).rejects.toThrow(/exceeded its 0\.7s deadline 2 time\(s\)/);
  });

  it('assembles streamed content and reads usage + cost from the final chunk', async () => {
    const s = await serve((res) => {
      sse(res, { choices: [{ delta: { reasoning: 'thinking' } }] });
      sse(res, { choices: [{ delta: { content: '{"ok":' } }] });
      sse(res, { choices: [{ delta: { content: 'true}' } }] });
      sse(res, { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.0004 } });
      res.end('data: [DONE]\n\n');
    });
    const p = new OpenRouterProvider('k', { baseURL: s.url, maxRetries: 0 });
    const res = await call(p);
    expect(res.data).toEqual({ ok: true });
    expect(res).toMatchObject({ tokensIn: 12, tokensOut: 3, costUsd: 0.0004, raw: '{"ok":true}' });
    expect(s.hits()).toBe(1);
  });

  it('surfaces an upstream error sent mid-stream (the SDK raises it)', async () => {
    const s = await serve((res) => {
      sse(res, { error: { message: 'Provider returned error' } });
      res.end('data: [DONE]\n\n');
    });
    const p = new OpenRouterProvider('k', { baseURL: s.url, maxRetries: 0 });
    await expect(call(p)).rejects.toThrow(/Provider returned error/);
  });
});
