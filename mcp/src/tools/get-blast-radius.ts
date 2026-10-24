import { BlastRadius, getBlastRadiusInput } from '../contracts.js';
import { renderBlast, toolError } from '../format.js';
import { blastRateLimited } from '../messages.js';
import { apiErrorText, failureText, resolvePr, resolveRepo } from '../resolve.js';
import { defineTool } from './types.js';

export const getBlastRadius = defineTool({
  name: 'get_blast_radius',
  title: 'Get PR blast radius',
  description:
    'Map what a pull request can break: the symbols declared in its changed files, their callers as file:line, and the HTTP endpoints and crons behind those callers. Reads the precomputed repo index (no model call) and flags an incomplete index with a reason.',
  inputShape: getBlastRadiusInput,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(args, ctx) {
    const { api, config, signal } = ctx;
    const repo = await resolveRepo(api, args.repo, signal);
    if (!repo.ok) return toolError(failureText(repo.failure, config.apiUrl));
    const pr = await resolvePr(api, repo.value, args.repo, args.pr, signal);
    if (!pr.ok) return toolError(failureText(pr.failure, config.apiUrl));

    const res = await api.get(`/pulls/${encodeURIComponent(pr.value)}/blast`, BlastRadius, signal);
    if (!res.ok) {
      const e = res.error;
      if (e.kind === 'http' && e.status === 429) return toolError(blastRateLimited());
      return toolError(apiErrorText(e, config.apiUrl));
    }
    return renderBlast(args.repo, args.pr, res.value);
  },
});
