import { z } from 'zod';
import { Finding } from '@devdigest/shared';

/** A case passes when both scores reach these thresholds. */
export const PASS_RECALL = 0.8;
export const PASS_PRECISION = 0.7;

export const EvalCaseBody = z.object({
  owner_kind: z.enum(['skill', 'agent']),
  owner_id: z.string().uuid(),
  name: z.string().min(1),
  input_diff: z.string().optional(),
  notes: z.string().optional(),
});
export type EvalCaseBody = z.infer<typeof EvalCaseBody>;

export const ScoreBody = z.object({ findings: z.array(Finding) });
export type ScoreBody = z.infer<typeof ScoreBody>;
