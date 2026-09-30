/**
 * Onion Architecture ring rules, asserted in the unit lane.
 *
 * This runs the SAME `.dependency-cruiser.cjs` the `pnpm arch` script uses, so
 * `pnpm test` fails on a ring violation without anyone having to know that a
 * separate command exists. The rules themselves and the reasoning behind them
 * live in `.claude/skills/onion-architecture/`.
 *
 * Two assertions:
 *   1. no violation outside the committed baseline
 *   2. the baseline itself has not grown
 *
 * The baseline (`.dependency-cruiser-known-violations.json`) is a debt ledger
 * for the modules that predate the rules — entries may only be removed.
 * Regenerate it with `pnpm arch:baseline` AFTER migrating a module, and the
 * diff is the proof the migration landed.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cruise, type ICruiseResult, type IViolation } from 'dependency-cruiser';
import extractDepcruiseConfig from 'dependency-cruiser/config-utl/extract-depcruise-config';
import knownViolations from '../.dependency-cruiser-known-violations.json' with { type: 'json' };

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The baseline as of the last `pnpm arch:baseline`. Bumping this number is only
 * ever correct downward — see the module doc-comment.
 */
const BASELINE_SIZE = 16;

/** Identity of a violation, stable across runs: which rule, from where, to where. */
const key = (v: Pick<IViolation, 'from' | 'to'> & { rule: { name: string } }) =>
  `${v.rule.name} :: ${v.from} -> ${v.to}`;

async function cruiseServer(): Promise<ICruiseResult> {
  const config = await extractDepcruiseConfig(
    path.join(serverRoot, '.dependency-cruiser.cjs'),
  );
  const result = await cruise(
    ['src'],
    // `validate: true` is NOT implied by passing a ruleSet — the CLI sets it for
    // you, the programmatic API does not. Without it `violations` is silently []
    // and this test passes while proving nothing.
    { ...config.options, ruleSet: config, validate: true },
  );
  return result.output as ICruiseResult;
}

describe('onion architecture rings', () => {
  it('has no ring violation outside the committed baseline', async () => {
    const { summary } = await cruiseServer();
    const known = new Set(knownViolations.map(key));
    const fresh = summary.violations.filter((v) => !known.has(key(v)));

    expect(
      fresh.map((v) => `${key(v)}\n    → ${v.rule.name}: see pnpm arch for the full explanation`),
    ).toEqual([]);
  });

  it('has a baseline that only ever shrinks', async () => {
    expect(knownViolations.length).toBeLessThanOrEqual(BASELINE_SIZE);
  });
});
