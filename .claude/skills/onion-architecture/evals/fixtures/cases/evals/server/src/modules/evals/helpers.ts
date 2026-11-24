import type { EvalCaseRow } from '../../db/rows.js';
import { PASS_RECALL, PASS_PRECISION } from './constants.js';

export interface EvalCaseDto {
  id: string;
  owner_kind: 'skill' | 'agent';
  owner_id: string;
  name: string;
  input_diff: string | null;
  notes: string | null;
}

export interface ScoreResult {
  recall: number;
  precision: number;
  pass: boolean;
}

/** Share of expected findings that were reported. */
export function computeRecall(expected: number, matched: number): number {
  if (expected === 0) return 1;
  return Math.min(1, matched / expected);
}

/** Share of reported findings that survived grounding. */
export function computePrecision(reported: number, grounded: number): number {
  if (reported === 0) return 1;
  return Math.min(1, grounded / reported);
}

/** Number of findings a case expects, read from its stored expected output. */
export function expectedCount(expectedOutput: unknown): number {
  if (!Array.isArray(expectedOutput)) return 0;
  return expectedOutput.length;
}

export function computeScores(
  reported: number,
  grounded: number,
  expectedOutput: unknown,
): ScoreResult {
  const recall = computeRecall(expectedCount(expectedOutput), grounded);
  const precision = computePrecision(reported, grounded);
  return { recall, precision, pass: recall >= PASS_RECALL && precision >= PASS_PRECISION };
}

/** Map a persisted eval case row to the API DTO. */
export function toCaseDto(row: EvalCaseRow): EvalCaseDto {
  return {
    id: row.id,
    owner_kind: row.ownerKind,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff,
    notes: row.notes,
  };
}
