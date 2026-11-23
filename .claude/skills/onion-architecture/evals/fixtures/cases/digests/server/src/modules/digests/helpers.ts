import type { Digest, PrMeta } from '@devdigest/shared';
import type { DigestRow } from '../../db/rows.js';
import { AppError } from '../../platform/errors.js';
import { DEFAULT_PERIOD_DAYS, MAX_PULLS_IN_DIGEST } from './constants.js';

export interface Period {
  start: Date;
  end: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve the requested ISO range, defaulting to the last N days before `now`. */
export function resolvePeriod(
  startIso: string | undefined,
  endIso: string | undefined,
  now: Date,
): Period {
  const end = endIso ? new Date(endIso) : now;
  const start = startIso ? new Date(startIso) : new Date(end.getTime() - DEFAULT_PERIOD_DAYS * DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new AppError('invalid_period', 'period_start must be an ISO date before period_end', 400);
  }
  return { start, end };
}

/** Render the markdown body of a digest from the PRs updated inside the period. */
export function renderDigest(repo: string, period: Period, pulls: PrMeta[]): string {
  const inPeriod = pulls
    .filter((p) => {
      if (!p.updated_at) return false;
      const at = new Date(p.updated_at);
      return at >= period.start && at <= period.end;
    })
    .slice(0, MAX_PULLS_IN_DIGEST);

  const lines = [
    `# Digest for ${repo}`,
    '',
    `${period.start.toISOString().slice(0, 10)} — ${period.end.toISOString().slice(0, 10)}`,
    '',
  ];
  if (inPeriod.length === 0) {
    lines.push('No pull request activity in this period.');
  }
  for (const p of inPeriod) {
    lines.push(`- #${p.number} ${p.title} (${p.author}, ${p.status}, +${p.additions}/-${p.deletions})`);
  }
  return lines.join('\n');
}

/** Map a persisted digest row to the API DTO. */
export function toDigestDto(row: DigestRow): Digest {
  return {
    id: row.id,
    period_start: row.periodStart?.toISOString() ?? null,
    period_end: row.periodEnd?.toISOString() ?? null,
    body_md: row.bodyMd,
    delivered_to: row.deliveredTo,
  };
}
