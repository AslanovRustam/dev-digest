import { ConventionsList, getConventionsInput } from '../contracts.js';
import { renderConventions, toolError } from '../format.js';
import { apiErrorText, failureText, resolveRepo } from '../resolve.js';
import { defineTool } from './types.js';

export const getConventions = defineTool({
  name: 'get_conventions',
  title: 'Get repo conventions',
  description:
    "Get a repository's coding conventions extracted by DevDigest, with file evidence (accepted ones by default). Use status to see pending or rejected candidates.",
  inputShape: getConventionsInput,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(args, ctx) {
    const { api, config, signal } = ctx;
    const repo = await resolveRepo(api, args.repo, signal);
    if (!repo.ok) return toolError(failureText(repo.failure, config.apiUrl));

    const res = await api.get(
      `/repos/${encodeURIComponent(repo.value)}/conventions`,
      ConventionsList,
      signal,
    );
    if (!res.ok) return toolError(apiErrorText(res.error, config.apiUrl));

    const wanted =
      args.status === 'all'
        ? res.value.candidates
        : res.value.candidates.filter((c) => c.status === args.status);
    const hasAccepted = res.value.candidates.some((c) => c.status === 'accepted');
    return renderConventions(args.repo, res.value.scan?.created_at ?? null, wanted, {
      hasAccepted,
      limit: args.limit,
      cursor: args.cursor,
      format: args.response_format,
    });
  },
});
