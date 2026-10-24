import { getBlastRadiusInput } from '../contracts.js';
import { toolError } from '../format.js';
import { blastRadiusNotImplemented } from '../messages.js';
import { defineTool } from './types.js';

export const getBlastRadius = defineTool({
  name: 'get_blast_radius',
  title: 'Blast radius (not implemented)',
  description:
    'NOT IMPLEMENTED (L04): will show which symbols, callers and endpoints a PR affects. It always returns an error for now; use run_agent_on_pr or get_findings instead.',
  inputShape: getBlastRadiusInput,
  annotations: { readOnlyHint: true },
  async run() {
    return toolError(blastRadiusNotImplemented());
  },
});
