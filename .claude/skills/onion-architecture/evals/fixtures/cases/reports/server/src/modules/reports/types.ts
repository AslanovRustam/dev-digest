import type { Finding } from '@devdigest/shared';

/** A stored report as the API returns it. */
export interface ReportDto {
  id: string;
  pr_id: string;
  body: string;
  verdict: string | null;
  posted_at: string | null;
  github_review_id: string | null;
}

/** A report that was just composed, with where it would be posted. */
export interface ComposedReport extends ReportDto {
  owner: string;
  repo: string;
  pr_number: number;
}

/** Everything the markdown renderer needs. */
export interface ReportInput {
  repo: string;
  prNumber: number;
  title: string;
  score: number;
  blockers: number;
  findings: Finding[];
  note?: string;
}

export type ExportFormat = 'md' | 'json';
