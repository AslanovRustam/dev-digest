import { z } from 'zod';
import { DigestRunRequest } from '@devdigest/shared';

/** JobRunner kind for a scheduled digest build. */
export const DIGEST_JOB_KIND = 'digest';

/** Period length used when the request carries no range. */
export const DEFAULT_PERIOD_DAYS = 7;

/** Most pull requests listed in one digest body. */
export const MAX_PULLS_IN_DIGEST = 50;

export const DigestBuildBody = DigestRunRequest.extend({
  owner: z.string().min(1),
  name: z.string().min(1),
  repo_id: z.string().uuid().optional(),
});
export type DigestBuildBody = z.infer<typeof DigestBuildBody>;

export const DigestDeliverBody = z.object({ channel: z.string().min(1) });
export type DigestDeliverBody = z.infer<typeof DigestDeliverBody>;
