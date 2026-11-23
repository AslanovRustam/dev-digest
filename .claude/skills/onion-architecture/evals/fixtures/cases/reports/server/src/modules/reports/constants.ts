import { z } from 'zod';

/** Reports kept per pull request in the list view. */
export const LIST_LIMIT = 10;

/** Severity weights used to turn a set of findings into one score. */
export const SEVERITY_WEIGHT = {
  critical: 10,
  high: 5,
  medium: 2,
  low: 1,
  info: 0,
} as const;

/** Findings at these severities block a merge. */
export const BLOCKING_SEVERITIES = ['critical', 'high'] as const;

/** Longest free-text note a caller can attach to a report. */
export const MAX_NOTE_CHARS = 2000;

export const ComposeBody = z.object({
  post_to_github: z.boolean().default(false),
  note: z.string().max(MAX_NOTE_CHARS).optional(),
});
export type ComposeBody = z.infer<typeof ComposeBody>;

export const ExportQuery = z.object({
  format: z.enum(['md', 'json']).default('md'),
});
export type ExportQuery = z.infer<typeof ExportQuery>;
