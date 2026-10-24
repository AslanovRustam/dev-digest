import { AGENT_DESCRIPTION_MAX } from '../constants.js';
import { AgentList, listAgentsInput } from '../contracts.js';
import { toolError, toolText, truncate } from '../format.js';
import { apiErrorText } from '../resolve.js';
import { defineTool } from './types.js';

export const listAgents = defineTool({
  name: 'list_agents',
  title: 'List reviewer agents',
  description:
    'List the configured reviewer agents with their ids, models and enabled state. Call it first to get a valid agent id for run_agent_on_pr.',
  inputShape: listAgentsInput,
  annotations: { readOnlyHint: true, idempotentHint: true },
  async run(_args, ctx) {
    const res = await ctx.api.get('/agents', AgentList, ctx.signal);
    if (!res.ok) return toolError(apiErrorText(res.error, ctx.config.apiUrl));
    return toolText({
      agents: res.value.map((a) => ({
        id: a.id,
        name: a.name,
        model: a.model,
        enabled: a.enabled,
        description: truncate(a.description, AGENT_DESCRIPTION_MAX),
      })),
    });
  },
});
