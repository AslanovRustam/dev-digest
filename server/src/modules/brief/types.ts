import type { RunEventKind } from '@devdigest/shared';

/** Sink for allowlisted log lines (a pino callback on the route). Never receives prompt text. */
export type BriefLogFn = (kind: RunEventKind, msg: string, data?: Record<string, unknown>) => void;
