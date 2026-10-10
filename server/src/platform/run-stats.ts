import prettyMs from 'pretty-ms';

/** Timing of one agent run, as the stats panel needs it. */
export interface RunTiming {
  durationMs: number;
  ok: boolean;
}

/** Average duration of the successful runs, formatted for the UI ("1.2s"). */
export function averageSuccessfulDuration(runs: RunTiming[]): string {
  const ok = runs.filter((r) => r.ok);
  const total = ok.reduce((sum, r) => sum + r.durationMs, 0);
  return prettyMs(total / runs.length);
}

/** Share of successful runs, in whole percent. */
export function successRate(runs: RunTiming[]): number {
  if (runs.length === 0) return 0;
  return Math.round((runs.filter((r) => r.ok).length / runs.length) * 100);
}
