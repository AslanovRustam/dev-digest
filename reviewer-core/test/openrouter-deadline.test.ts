/**
 * A structured call must end within its deadline even when the upstream sends
 * response headers at once and then keeps the body open (OpenRouter answers a
 * long non-streaming request early and trickles whitespace while the model
 * generates). The SDK's own `timeout` stops counting once headers arrive, so a
 * PR review hung for 20+ minutes; the provider now enforces a wall-clock
 * deadline that also aborts reading the body.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';
import { OpenRouterProvider } from '../src/llm/openrouter.js';

const Schema = z.object({ ok: z.boolean() });
const servers: Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

let hits = 0;

/** Answers 200 immediately, then sends a space every 50 ms and never finishes. */
async function tricklingServer(): Promise<string> {
  hits = 0;
  const server = createServer((_req, res) => {
    hits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    const t = setInterval(() => res.write(' '), 50);
    res.on('close', () => clearInterval(t));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe('OpenRouterProvider deadline', () => {
  it('aborts a call whose body never completes, retries once, then fails clearly', async () => {
    const baseURL = await tricklingServer();
    // The SDK per-request timeout alone (200 ms here) would NOT end this call.
    const p = new OpenRouterProvider('k', { baseURL, timeoutMs: 200, maxRetries: 0, deadlineMs: 600 });
    const started = Date.now();
    await expect(
      p.completeStructured({
        model: 'm',
        schema: Schema,
        schemaName: 'Probe',
        messages: [{ role: 'user', content: 'hi' }],
        maxRetries: 0,
      }),
    ).rejects.toThrow(/Probe.*exceeded its 0\.6s deadline 2 time\(s\)/);
    expect(hits).toBe(2); // retried once — another upstream may answer
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('lets a per-call timeoutMs override the provider deadline', async () => {
    const baseURL = await tricklingServer();
    const p = new OpenRouterProvider('k', { baseURL, maxRetries: 0, deadlineMs: 60_000 });
    await expect(
      p.completeStructured({
        model: 'm',
        schema: Schema,
        schemaName: 'Probe',
        messages: [{ role: 'user', content: 'hi' }],
        maxRetries: 0,
        timeoutMs: 400,
      }),
    ).rejects.toThrow(/exceeded its 0\.4s deadline/);
  });
});
