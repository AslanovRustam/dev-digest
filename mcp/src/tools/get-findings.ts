import { RunFindings, getFindingsInput } from '../contracts.js';
import { renderRun, toolError } from '../format.js';
import { runNotFound } from '../messages.js';
import { apiErrorText } from '../resolve.js';
import { defineTool } from './types.js';

export const getFindings = defineTool({
  name: 'get_findings',
  title: 'Get review findings',
  description:
    'Get the verdict and findings of a review run, sorted by severity; also reports a run that is still in progress. Use response_format "detailed" for rationale and suggestions.',
  inputShape: getFindingsInput,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(args, ctx) {
    // run_id is a validated uuid (input schema); still encoded for the path.
    const res = await ctx.api.get(
      `/runs/${encodeURIComponent(args.run_id)}/findings`,
      RunFindings,
      ctx.signal,
    );
    if (!res.ok) {
      const e = res.error;
      if (e.kind === 'http' && e.status === 404) return toolError(runNotFound());
      return toolError(apiErrorText(e, ctx.config.apiUrl));
    }
    return renderRun(res.value, {
      limit: args.limit,
      cursor: args.cursor,
      format: args.response_format,
    });
  },
});
