import { z } from 'zod';
import { DEFAULT_FINDINGS_LIMIT } from '../constants.js';
import { ReviewRunResponse, runAgentOnPrInput } from '../contracts.js';
import { renderRun, runningResult, toolError } from '../format.js';
import { agentNotFound, badShape, pollError, requestAborted } from '../messages.js';
import { apiErrorText, failureText, resolvePr, resolveRepo } from '../resolve.js';
import { waitForRun } from '../wait.js';
import { defineTool } from './types.js';

export const runAgentOnPr = defineTool({
  name: 'run_agent_on_pr',
  title: 'Review a PR with an agent',
  description:
    'Run one reviewer agent on a pull request, wait for it to finish and return the verdict with compact findings. If the review outlasts the wait limit, it returns a run_id for get_findings instead.',
  inputShape: runAgentOnPrInput,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async run(args, ctx) {
    const { api, config, signal } = ctx;
    // The server does not validate agentId as a uuid; only a uuid ever reaches a path or body.
    if (!z.uuid().safeParse(args.agent).success) return toolError(agentNotFound(args.agent));

    const repo = await resolveRepo(api, args.repo, signal);
    if (!repo.ok) return toolError(failureText(repo.failure, config.apiUrl));
    const pr = await resolvePr(api, repo.value, args.repo, args.pr, signal);
    if (!pr.ok) return toolError(failureText(pr.failure, config.apiUrl));

    const started = await api.post(
      `/pulls/${encodeURIComponent(pr.value)}/review`,
      { agentId: args.agent },
      ReviewRunResponse,
      signal,
    );
    if (!started.ok) {
      const e = started.error;
      if (e.kind === 'http' && e.status === 404) return toolError(agentNotFound(args.agent));
      return toolError(apiErrorText(e, config.apiUrl));
    }
    const run = started.value.runs;
    if (run.length !== 1 || run[0] === undefined) return toolError(badShape());
    const runId = run[0].run_id;

    const outcome = await waitForRun(api, ctx.clock, runId, {
      capMs: config.runWaitMs,
      intervalMs: config.pollIntervalMs,
      signal,
      ...(ctx.progress ? { onProgress: ctx.progress } : {}),
    });
    switch (outcome.kind) {
      case 'finished':
        return renderRun(outcome.run, { limit: DEFAULT_FINDINGS_LIMIT, format: 'concise' });
      case 'capped':
        return runningResult(runId);
      case 'aborted':
        return toolError(requestAborted(runId));
      case 'error':
        return toolError(pollError(apiErrorText(outcome.error, config.apiUrl), runId));
    }
  },
});
