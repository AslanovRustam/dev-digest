#!/usr/bin/env node
/** Ring 4 composition root: config -> HTTP adapter -> real clock -> server -> stdio. */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createHttpApi } from './adapters/http-api.js';
import { loadConfig } from './config.js';
import type { Clock } from './ports.js';
import { createServer } from './server.js';

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal?.addEventListener('abort', done, { once: true });
    }),
};

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer({ api: createHttpApi(config), clock: realClock, config });
  await server.connect(new StdioServerTransport());
  console.error(`[devdigest-mcp] ready, API ${config.apiUrl}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'devdigest-mcp failed to start');
  process.exit(1);
});
