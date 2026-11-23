import { z } from 'zod';
import { CI_TARGET_TYPES } from '../../../modules/ci/constants.js';

/** Status badge a repo shows for its CI installation. */
export const CiBadge = z.object({
  repo: z.string(),
  target: z.enum(CI_TARGET_TYPES),
  passing: z.boolean(),
  last_run_at: z.string().nullable(),
});
export type CiBadge = z.infer<typeof CiBadge>;
