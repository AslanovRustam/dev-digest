import { renderMarkdown } from '../modules/reports/format.js';
import type { ReportInput } from '../modules/reports/types.js';

const CACHE_LIMIT = 200;
const cache = new Map<string, string>();

/**
 * Process-local cache of rendered report markdown, keyed by pull request and head sha.
 */
export function cachedMarkdown(key: string, input: ReportInput): string {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const rendered = renderMarkdown(input);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, rendered);
  return rendered;
}

export function clearReportCache(): void {
  cache.clear();
}
