/** Ring 0: every actionable error / `next` text. Each one names a next step. */
import { KNOWN_LIST_LIMIT, RUN_ERROR_MAX } from './constants.js';

export const repoFormatInvalid = (): string => "repo must be 'owner/name'";

export const repoNotFound = (repo: string, known: string[]): string =>
  `Repo ${repo} is not in DevDigest — add it in the UI (localhost:3000). Known: ${
    known.slice(0, KNOWN_LIST_LIMIT).join(', ') || 'none'
  }`;

export const prNotFound = (n: number, repo: string, known: number[]): string =>
  `PR #${n} not found in ${repo} — open/import it in DevDigest first. Known: ${
    known
      .slice(0, KNOWN_LIST_LIMIT)
      .map((k) => `#${k}`)
      .join(', ') || 'none'
  }`;

export const waitingForRun = (status: string): string => `Review run is ${status}`;

export const apiUnreachable = (url: string): string =>
  `DevDigest API not reachable at ${url}. Start it (./scripts/dev.sh or cd server && pnpm dev), then retry.`;

export const apiTimeout = (): string =>
  'DevDigest API did not answer in time — check that the server is running (./scripts/dev.sh), then retry';

export const apiServerError = (): string =>
  'DevDigest API returned a server error — check the server terminal output, then retry';

export const apiRequestFailed = (status: number, message: string): string =>
  `DevDigest API rejected the request (HTTP ${status}): ${message}. Check the arguments, then retry`;

export const badShape = (): string => 'Unexpected API response — is the DevDigest server up to date?';

export const agentNotFound = (agent: string): string =>
  `Agent '${agent}' not found — call list_agents for valid ids`;

export const rateLimited = (): string => 'Review rate limit (10/min) hit — wait ~60s, then retry';

export const runFailed = (runId: string, error: string | null): string =>
  `Run ${runId} failed: ${(error ?? 'no error message').slice(0, RUN_ERROR_MAX)}. Check the agent's provider key in DevDigest Settings, then retry run_agent_on_pr`;

export const runCancelled = (runId: string): string =>
  `Run ${runId} was cancelled — start a new one with run_agent_on_pr`;

export const runNotFound = (): string => 'Run not found — run ids come from run_agent_on_pr';

export const pollError = (error: string, runId: string): string =>
  `${error}. The run continues server-side — call get_findings(${runId}) later`;

export const requestAborted = (runId: string): string =>
  `Request cancelled. The review keeps running server-side — call get_findings(${runId}) later`;

export const invalidCursor = (): string =>
  'Invalid cursor — pass next_cursor from the previous response, or omit cursor to start at the first page';

export const unexpectedError = (): string =>
  'devdigest-mcp hit an unexpected error — retry; if it persists, check the MCP server log (stderr)';

export const stillRunningNext = (runId: string): string => `call get_findings(${runId}) in ~30s`;

export const noConventionsNext = (): string =>
  'extract or accept conventions in the DevDigest UI (Conventions tab)';

export const blastRateLimited = (): string =>
  'Blast radius rate limit (30/min) hit — wait ~60s, then retry';

export const blastDegradedNext = (): string =>
  'the repo index is incomplete — re-sync the repo index in the DevDigest UI, then retry';

export const blastMoreNext = (): string =>
  "open the PR's Overview tab in the DevDigest UI for the full map";
