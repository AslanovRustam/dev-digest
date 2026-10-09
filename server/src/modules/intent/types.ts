import type {
  PrIntentRecord,
  PrIntentResponse,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import type { PullRow, RepoRow } from '../../db/rows.js';

/**
 * Intent layer — cross-module contract. Other modules (reviews) reach intent
 * ONLY through `container.intent`, typed by this file; they never import
 * `intent/service`. Type imports only.
 */

/** Sink for allowlisted log lines (RunLogger.event in a review run, a pino callback on the route). */
export type IntentLogFn = (kind: RunEventKind, msg: string, data?: Record<string, unknown>) => void;

export interface IntentFacade {
  /** Stored intent for a PR. Reads only — never calls a model. */
  get(workspaceId: string, prId: string): Promise<PrIntentResponse>;
  /** Collect sources, classify (one cheap call), persist. Used by the explicit (re-)derive. */
  derive(
    workspaceId: string,
    prId: string,
    opts?: { diff?: UnifiedDiff; log?: IntentLogFn },
  ): Promise<PrIntentResponse>;
  /**
   * For a review run: the stored intent (even when stale), else a fresh derivation
   * from the already-loaded diff. Never throws — any failure returns null and the
   * review proceeds without intent.
   */
  forReview(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLogFn,
  ): Promise<PrIntentRecord | null>;
}
