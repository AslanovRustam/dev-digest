import type { InstalledPlugin } from '@devdigest/shared';
import * as t from '../../db/schema.js';

type PluginRow = typeof t.installedPlugins.$inferSelect;

/** Compare two dotted versions; a missing version is older than any present one. */
export function isNewerVersion(current: string | null, candidate: string | null): boolean {
  if (candidate === null) return false;
  if (current === null) return true;
  const a = current.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const b = candidate.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (b[i] ?? 0) - (a[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/** Map a persisted installed-plugin row to the API DTO. */
export function toPluginDto(row: PluginRow): InstalledPlugin {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    source: row.source,
    installed_at: row.installedAt.toISOString(),
    enabled: row.enabled,
  };
}
