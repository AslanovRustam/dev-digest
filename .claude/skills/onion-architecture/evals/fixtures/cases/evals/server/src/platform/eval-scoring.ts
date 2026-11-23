import { computeRecall, computePrecision } from '../modules/evals/helpers.js';

/**
 * One-line score summary for run logs and the SSE progress stream.
 */
export function scoreLine(expected: number, matched: number, reported: number): string {
  const recall = computeRecall(expected, matched);
  const precision = computePrecision(reported, matched);
  return `recall=${(recall * 100).toFixed(0)}% precision=${(precision * 100).toFixed(0)}%`;
}
