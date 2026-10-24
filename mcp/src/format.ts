/** Ring 0: pure output shaping. Compact JSON, truncation, offset pagination. SDK-free. */
import { BLAST_FACTS_MAX, BLAST_SYMBOLS_MAX, FINDING_TEXT_MAX, SNIPPET_MAX, SUMMARY_MAX } from './constants.js';
import type { BlastRadius, Convention, Finding, RunFindings } from './contracts.js';
import {
  blastDegradedNext,
  blastMoreNext,
  invalidCursor,
  noConventionsNext,
  runCancelled,
  runFailed,
  stillRunningNext,
} from './messages.js';

/** What every tool returns; only `server.ts` maps it to MCP `content`. */
export interface ToolResult {
  text: string;
  isError?: true;
}

export type ResponseFormat = 'concise' | 'detailed';

export const toolText = (value: unknown): ToolResult => ({ text: JSON.stringify(value) });

export const toolError = (message: string): ToolResult => ({ text: message, isError: true });

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// ---- pagination: opaque offset cursor ----

const encodeCursor = (offset: number): string => btoa(`o:${offset}`);

function decodeCursor(cursor: string): number | undefined {
  try {
    const m = /^o:(\d{1,9})$/.exec(atob(cursor));
    return m?.[1] === undefined ? undefined : Number(m[1]);
  } catch {
    return undefined;
  }
}

export type Page<T> = { ok: true; items: T[]; nextCursor?: string } | { ok: false; message: string };

export function paginate<T>(items: T[], limit: number, cursor?: string): Page<T> {
  let offset = 0;
  if (cursor !== undefined) {
    const decoded = decodeCursor(cursor);
    if (decoded === undefined || decoded > items.length) {
      return { ok: false, message: invalidCursor() };
    }
    offset = decoded;
  }
  const end = offset + limit;
  const page: Page<T> = { ok: true, items: items.slice(offset, end) };
  if (end < items.length) page.nextCursor = encodeCursor(end);
  return page;
}

// ---- findings ----

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

export function severityCounts(findings: Finding[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else counts.suggestion += 1;
  }
  return counts;
}

const lineRange = (start: number, end: number): string => (end > start ? `${start}-${end}` : `${start}`);

export function compactFinding(f: Finding, format: ResponseFormat): Record<string, unknown> {
  const base = {
    id: f.id,
    severity: f.severity,
    file: f.file,
    lines: lineRange(f.start_line, f.end_line),
    title: f.title,
  };
  if (format === 'concise') return base;
  return {
    ...base,
    category: f.category,
    confidence: f.confidence,
    rationale: truncate(f.rationale, FINDING_TEXT_MAX),
    suggestion: f.suggestion ? truncate(f.suggestion, FINDING_TEXT_MAX) : null,
  };
}

export const runningResult = (runId: string): ToolResult =>
  toolText({ run_id: runId, status: 'running', next: stillRunningNext(runId) });

export interface RenderOptions {
  limit: number;
  cursor?: string | undefined;
  format: ResponseFormat;
}

/** One run -> tool result. Shared by run_agent_on_pr and get_findings. Dismissed findings are only counted. */
export function renderRun(run: RunFindings, opts: RenderOptions): ToolResult {
  if (run.status === 'running') return runningResult(run.run_id);
  if (run.status === 'failed') return toolError(runFailed(run.run_id, run.error));
  if (run.status === 'cancelled') return toolError(runCancelled(run.run_id));

  const active = run.findings.filter((f) => !f.dismissed_at);
  const page = paginate(active, opts.limit, opts.cursor);
  if (!page.ok) return toolError(page.message);
  return toolText({
    run_id: run.run_id,
    status: run.status,
    verdict: run.verdict,
    score: run.score,
    summary: run.summary === null ? null : truncate(run.summary, SUMMARY_MAX),
    counts: severityCounts(active),
    dismissed: run.findings.length - active.length,
    findings: page.items.map((f) => compactFinding(f, opts.format)),
    ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}),
  });
}

// ---- conventions ----

export function compactConvention(c: Convention, format: ResponseFormat): Record<string, unknown> {
  const base = {
    category: c.category,
    rule: c.rule,
    evidence: `${c.evidence_path}:${lineRange(c.evidence_start_line, c.evidence_end_line)}`,
  };
  if (format === 'concise') return base;
  return {
    ...base,
    status: c.status,
    confidence: c.confidence,
    snippet: truncate(c.evidence_snippet, SNIPPET_MAX),
  };
}

export function renderConventions(
  repo: string,
  scannedAt: string | null,
  conventions: Convention[],
  opts: RenderOptions & { hasAccepted: boolean },
): ToolResult {
  const page = paginate(conventions, opts.limit, opts.cursor);
  if (!page.ok) return toolError(page.message);
  return toolText({
    repo,
    scanned_at: scannedAt,
    total: conventions.length,
    conventions: page.items.map((c) => compactConvention(c, opts.format)),
    ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}),
    ...(!opts.hasAccepted ? { next: noConventionsNext() } : {}),
  });
}

// ---- blast radius ----

/** Compact blast map: first BLAST_SYMBOLS_MAX symbol groups, callers as "file:line (name)", facts capped. */
export function renderBlast(repo: string, pr: number, blast: BlastRadius): ToolResult {
  const shown = blast.downstream.slice(0, BLAST_SYMBOLS_MAX);
  const omitted = blast.downstream.length - shown.length;
  const next = blast.degraded ? blastDegradedNext() : omitted > 0 ? blastMoreNext() : undefined;
  return toolText({
    repo,
    pr,
    summary: blast.summary,
    stats: blast.stats,
    degraded: blast.degraded,
    reason: blast.reason,
    downstream: shown.map((g) => ({
      symbol: g.symbol,
      callers: g.callers.map((c) => `${c.file}:${c.line} (${c.name})`),
      endpoints: g.endpoints_affected.slice(0, BLAST_FACTS_MAX),
      crons: g.crons_affected.slice(0, BLAST_FACTS_MAX),
    })),
    ...(omitted > 0 ? { omitted_symbols: omitted } : {}),
    ...(next ? { next } : {}),
  });
}
