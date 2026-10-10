import { describe, expect, it } from 'vitest';
import { averageSuccessfulDuration, successRate } from '../src/platform/run-stats.js';

describe('run stats', () => {
  it('formats the average duration of successful runs', () => {
    expect(
      averageSuccessfulDuration([
        { durationMs: 1000, ok: true },
        { durationMs: 3000, ok: true },
      ]),
    ).toBe('2s');
  });

  it('computes the success rate in whole percent', () => {
    expect(successRate([{ durationMs: 1, ok: true }, { durationMs: 1, ok: false }, { durationMs: 1, ok: true }])).toBe(67);
    expect(successRate([])).toBe(0);
  });
});
