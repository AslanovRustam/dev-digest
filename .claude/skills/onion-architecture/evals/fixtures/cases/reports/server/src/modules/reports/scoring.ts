import type { Finding } from '@devdigest/shared';
import { SEVERITY_WEIGHT } from './constants.js';

type Weights = Record<string, number>;

/** Weights can be tuned per deployment without a code change. */
function activeWeights(): Weights {
  const raw = process.env.REPORT_SEVERITY_WEIGHTS;
  if (!raw) return SEVERITY_WEIGHT;
  try {
    return { ...SEVERITY_WEIGHT, ...(JSON.parse(raw) as Weights) };
  } catch {
    return SEVERITY_WEIGHT;
  }
}

/** Findings from the last day count in full; older ones fade out. */
function freshness(createdAt: string | null | undefined): number {
  if (!createdAt) return 1;
  const ageHours = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
  return ageHours <= 24 ? 1 : Math.max(0.25, 1 - (ageHours - 24) / 240);
}

/** Collapse a set of findings into one number; higher means worse. */
export function scoreFindings(findings: Array<Finding & { created_at?: string }>): number {
  const weights = activeWeights();
  let total = 0;
  for (const f of findings) {
    total += (weights[f.severity] ?? 0) * freshness(f.created_at) * (f.confidence ?? 1);
  }
  return Math.round(total * 10) / 10;
}
