import { describe, expect, it } from 'vitest';
import * as m from '../src/messages.js';

// Every actionable text must name a next step: a tool, a command, or a place in the UI.
const NEXT_STEP = /list_agents|get_findings|run_agent_on_pr|\.\/scripts\/dev\.sh|pnpm|UI|Settings|retry|omit cursor|owner\/name|Check|check|Conventions tab|Use |open\/import it in DevDigest|server up to date/;

describe('messages', () => {
  const samples: Record<string, string> = {
    repoFormatInvalid: m.repoFormatInvalid(),
    repoNotFound: m.repoNotFound('a/b', ['x/y']),
    prNotFound: m.prNotFound(7, 'a/b', [1, 2]),
    apiUnreachable: m.apiUnreachable('http://localhost:3001'),
    apiTimeout: m.apiTimeout(),
    apiServerError: m.apiServerError(),
    apiRequestFailed: m.apiRequestFailed(400, 'bad'),
    badShape: m.badShape(),
    agentNotFound: m.agentNotFound('x'),
    rateLimited: m.rateLimited(),
    runFailed: m.runFailed('r1', 'boom'),
    runCancelled: m.runCancelled('r1'),
    runNotFound: m.runNotFound(),
    pollError: m.pollError('oops', 'r1'),
    requestAborted: m.requestAborted('r1'),
    invalidCursor: m.invalidCursor(),
    unexpectedError: m.unexpectedError(),
    blastRadiusNotImplemented: m.blastRadiusNotImplemented(),
    stillRunningNext: m.stillRunningNext('r1'),
    noConventionsNext: m.noConventionsNext(),
  };

  it.each(Object.entries(samples))('%s names a next step', (_name, text) => {
    expect(text).toMatch(NEXT_STEP);
  });

  it('matches the plan 6b wording for the fixed texts', () => {
    expect(samples.apiUnreachable).toBe(
      'DevDigest API not reachable at http://localhost:3001. Start it (./scripts/dev.sh or cd server && pnpm dev), then retry.',
    );
    expect(samples.agentNotFound).toBe("Agent 'x' not found — call list_agents for valid ids");
    expect(samples.rateLimited).toBe('Review rate limit (10/min) hit — wait ~60s, then retry');
    expect(samples.runNotFound).toBe('Run not found — run ids come from run_agent_on_pr');
    expect(samples.pollError).toBe('oops. The run continues server-side — call get_findings(r1) later');
    expect(samples.stillRunningNext).toBe('call get_findings(r1) in ~30s');
  });

  it('caps the failed-run error at 200 chars', () => {
    expect(m.runFailed('r1', 'e'.repeat(999))).toContain(`${'e'.repeat(200)}.`);
  });
});
