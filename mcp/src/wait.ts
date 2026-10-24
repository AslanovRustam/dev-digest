/** Ring 2: poll a run until it leaves `running`, the cap is hit, or the caller aborts. */
import { RunFindings } from './contracts.js';
import type { RunFindings as RunFindingsT } from './contracts.js';
import { waitingForRun } from './messages.js';
import type { ApiClient, ApiError, Clock, ProgressSink } from './ports.js';

export interface WaitOptions {
  capMs: number;
  intervalMs: number;
  signal?: AbortSignal;
  onProgress?: ProgressSink;
}

export type WaitOutcome =
  | { kind: 'finished'; run: RunFindingsT }
  | { kind: 'capped' }
  | { kind: 'aborted' }
  | { kind: 'error'; error: ApiError };

export async function waitForRun(
  api: ApiClient,
  clock: Clock,
  runId: string,
  opts: WaitOptions,
): Promise<WaitOutcome> {
  const start = clock.now();
  const capS = Math.round(opts.capMs / 1000);
  for (;;) {
    if (opts.signal?.aborted) return { kind: 'aborted' };
    const res = await api.get(
      `/runs/${encodeURIComponent(runId)}/findings`,
      RunFindings,
      opts.signal,
    );
    if (opts.signal?.aborted) return { kind: 'aborted' };
    if (!res.ok) return { kind: 'error', error: res.error };
    const elapsedMs = clock.now() - start;
    opts.onProgress?.(Math.round(elapsedMs / 1000), capS, waitingForRun(res.value.status));
    if (res.value.status !== 'running') return { kind: 'finished', run: res.value };
    if (elapsedMs + opts.intervalMs > opts.capMs) return { kind: 'capped' };
    await clock.sleep(opts.intervalMs, opts.signal);
  }
}
