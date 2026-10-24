import type { BlastDegradedReason, BlastRadiusResponse, BlastStats } from '@devdigest/shared';
import { MAX_CHANGED_SYMBOLS_LISTED } from './constants.js';

/**
 * Pure blast-radius mapping (ring 0). The inputs are LOCAL structural types
 * (the shape of repo-intel's `BlastResult` / `IndexState`): a domain file must
 * not import `repo-intel/types`.
 */

export interface BlastInput {
  changedSymbols: { file: string; name: string; kind: string }[];
  callers: { file: string; symbol: string; viaSymbol: string; line: number; rank: number }[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
}

export interface IndexStateInput {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  degradedReason?: BlastDegradedReason;
  lastIndexedSha: string;
}

type Downstream = BlastRadiusResponse['downstream'];
type Degradation = { degraded: boolean; reason: BlastDegradedReason | null };

const sortedUnique = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

/** Callers grouped by the changed symbol they reach, with endpoints / crons from the caller files. */
export function groupDownstream(input: BlastInput): Downstream {
  const groups = new Map<string, BlastInput['callers']>();
  for (const c of input.callers) {
    const arr = groups.get(c.viaSymbol);
    if (arr) arr.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const out: Downstream = [];
  for (const [symbol, rows] of groups) {
    const seen = new Set<string>();
    const unique = rows.filter((c) => {
      const key = `${c.file}|${c.line}|${c.symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line);
    const files = new Set(unique.map((c) => c.file));
    const endpoints: string[] = [];
    const crons: string[] = [];
    for (const f of files) {
      const facts = input.factsByFile?.[f];
      if (!facts) continue;
      endpoints.push(...facts.endpoints);
      crons.push(...facts.crons);
    }
    out.push({
      symbol,
      callers: unique.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
      endpoints_affected: sortedUnique(endpoints),
      crons_affected: sortedUnique(crons),
    });
  }
  out.sort((a, b) => b.callers.length - a.callers.length || a.symbol.localeCompare(b.symbol));
  return out;
}

export function blastStats(
  changedSymbols: { file: string; name: string }[],
  downstream: Downstream,
): BlastStats {
  const callers = new Set<string>();
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const g of downstream) {
    for (const c of g.callers) callers.add(`${c.file}|${c.line}|${c.name}`);
    for (const e of g.endpoints_affected) endpoints.add(e);
    for (const c of g.crons_affected) crons.add(c);
  }
  return {
    symbols: new Set(changedSymbols.map((s) => `${s.name}|${s.file}`)).size,
    callers: callers.size,
    endpoints: endpoints.size,
    crons: crons.size,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Number-only summary, e.g. "2 changed symbols, 14 callers, 3 endpoints, 1 cron". */
export function blastSummary(stats: BlastStats): string {
  return [
    plural(stats.symbols, 'changed symbol', 'changed symbols'),
    plural(stats.callers, 'caller', 'callers'),
    plural(stats.endpoints, 'endpoint', 'endpoints'),
    plural(stats.crons, 'cron', 'crons'),
  ].join(', ');
}

/** The facade only reports `no_data`; the honest reason comes from the index state and the config flag. */
export function blastDegradation(
  input: BlastInput,
  state: IndexStateInput,
  repoIntelEnabled: boolean,
): Degradation {
  if (!repoIntelEnabled) return { degraded: true, reason: 'flag_off' };
  if (input.degraded) {
    if (state.status === 'failed') return { degraded: true, reason: state.degradedReason ?? 'index_failed' };
    return { degraded: true, reason: state.degradedReason ?? input.reason ?? 'no_data' };
  }
  if (state.status === 'partial') return { degraded: true, reason: 'index_partial' };
  return { degraded: false, reason: null };
}

export function toBlastRadiusResponse(
  input: BlastInput,
  state: IndexStateInput,
  repoIntelEnabled: boolean,
): BlastRadiusResponse {
  const downstream = groupDownstream(input);
  const seen = new Set<string>();
  const changed = input.changedSymbols
    .filter((s) => {
      const key = `${s.name}|${s.file}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
  const stats = blastStats(changed, downstream);
  const { degraded, reason } = blastDegradation(input, state, repoIntelEnabled);
  return {
    changed_symbols: changed
      .slice(0, MAX_CHANGED_SYMBOLS_LISTED)
      .map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    downstream,
    summary: blastSummary(stats),
    stats,
    degraded,
    reason,
    indexed_sha: !input.degraded && state.lastIndexedSha ? state.lastIndexedSha : null,
  };
}
