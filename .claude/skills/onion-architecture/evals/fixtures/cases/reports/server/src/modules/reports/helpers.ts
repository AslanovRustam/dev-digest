import type { Finding } from '@devdigest/shared';
import type { ComposedReviewRow } from '../../db/rows.js';
import { BLOCKING_SEVERITIES, MAX_NOTE_CHARS } from './constants.js';
import type { ReportDto } from './types.js';

/** Map a persisted composed-review row to the API DTO. */
export function toReportDto(row: ComposedReviewRow): ReportDto {
  return {
    id: row.id,
    pr_id: row.prId,
    body: row.body,
    verdict: row.verdict,
    posted_at: row.postedAt?.toISOString() ?? null,
    github_review_id: row.githubReviewId,
  };
}

/** Whether any finding is severe enough to block a merge. */
export function isBlocking(findings: Finding[]): boolean {
  return findings.some((f) =>
    (BLOCKING_SEVERITIES as readonly string[]).includes(f.severity),
  );
}

/** Trim a caller-supplied note to the stored limit. */
export function clampNote(note: string | undefined): string | undefined {
  if (!note) return undefined;
  const trimmed = note.trim();
  return trimmed.length > MAX_NOTE_CHARS ? trimmed.slice(0, MAX_NOTE_CHARS) : trimmed;
}

/** Verdict string stored with a report. */
export function verdictFor(findings: Finding[]): 'request_changes' | 'comment' | 'approve' {
  if (isBlocking(findings)) return 'request_changes';
  return findings.length > 0 ? 'comment' : 'approve';
}
