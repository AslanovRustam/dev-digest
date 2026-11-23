import type { Db } from './client.js';
import * as t from './schema.js';
import { DEFAULT_TARGET_TYPE } from '../modules/ci/constants.js';

/**
 * Demo data: one CI installation per seeded repo for the given agent.
 * Idempotent — an agent that already has an installation for the repo is skipped.
 */
export async function seedCi(db: Db, agentId: string, repos: string[]): Promise<number> {
  const existing = await db.select({ repo: t.ciInstallations.repo }).from(t.ciInstallations);
  const have = new Set(existing.map((r) => r.repo));
  const missing = repos.filter((r) => !have.has(r));
  for (const repo of missing) {
    await db.insert(t.ciInstallations).values({ agentId, repo, targetType: DEFAULT_TARGET_TYPE });
  }
  return missing.length;
}
