import { z } from 'zod';

export const CI_TARGET_TYPES = ['gha', 'circle', 'jenkins', 'cli'] as const;

/** Target used when an installation does not name one. */
export const DEFAULT_TARGET_TYPE = 'gha';

/** File name of the generated workflow. */
export const WORKFLOW_FILENAME = 'devdigest-review.yml';

export const InstallBody = z.object({
  agent_id: z.string().uuid(),
  repo: z.string().min(1),
  target_type: z.enum(CI_TARGET_TYPES).default(DEFAULT_TARGET_TYPE),
});
export type InstallBody = z.infer<typeof InstallBody>;

export const AgentQuery = z.object({ agent_id: z.string().uuid() });
export type AgentQuery = z.infer<typeof AgentQuery>;
