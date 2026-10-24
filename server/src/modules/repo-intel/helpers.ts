/** repo-intel pure domain rules (ring 0): no I/O, no imports. */

/** Test/fixture/e2e paths: their endpoints (`app.inject` URLs) are not production routes. */
const TEST_SEGMENTS = new Set(['test', 'tests', '__tests__', '__mocks__', 'e2e']);

/** True for a test file path (`a.test.ts`, `test/x.ts`, `src/__tests__/y.ts`, `e2e/...`). */
export function isTestPath(path: string): boolean {
  const norm = path.replace(/\\/g, '/').toLowerCase();
  if (/\.(test|spec)\./.test(norm)) return true;
  const segments = norm.split('/');
  return segments.slice(0, -1).some((s) => TEST_SEGMENTS.has(s));
}

/**
 * Keep at most `max` callers per `viaSymbol` (not globally), preserving order, so one hot
 * symbol cannot hide the others' callers. The input is expected to be rank-sorted already.
 */
export function capCallersPerSymbol<T extends { viaSymbol: string }>(callers: T[], max: number): T[] {
  const perSymbol = new Map<string, number>();
  return callers.filter((c) => {
    const n = perSymbol.get(c.viaSymbol) ?? 0;
    if (n >= max) return false;
    perSymbol.set(c.viaSymbol, n + 1);
    return true;
  });
}

/**
 * One BFS hop over the import graph. `frontier` maps an origin caller file to the files to
 * expand; `edges` are the importer rows fetched for that frontier. Mutates `reached` (each
 * origin's visited set, so cycles terminate) and returns the next frontier.
 */
export function advanceFrontier(
  frontier: Map<string, string[]>,
  edges: { toFile: string; fromFile: string }[],
  reached: Map<string, Set<string>>,
): Map<string, string[]> {
  const importersOf = new Map<string, string[]>();
  for (const e of edges) {
    const arr = importersOf.get(e.toFile);
    if (arr) arr.push(e.fromFile);
    else importersOf.set(e.toFile, [e.fromFile]);
  }
  const next = new Map<string, string[]>();
  for (const [origin, files] of frontier) {
    const seen = reached.get(origin)!;
    const fresh: string[] = [];
    for (const file of files) {
      for (const imp of importersOf.get(file) ?? []) {
        if (seen.has(imp)) continue;
        seen.add(imp);
        fresh.push(imp);
      }
    }
    if (fresh.length > 0) next.set(origin, fresh);
  }
  return next;
}

/**
 * Roll the per-file facts up to each origin caller file (its own + everything it reached),
 * sorted and deduped; origins with no endpoints and no crons are omitted. Test paths are
 * skipped. Also returns the union of impacted endpoints.
 */
export function rollUpFacts(
  reached: Map<string, Set<string>>,
  facts: { filePath: string; endpoints: string[]; crons: string[] }[],
): { factsByFile: Record<string, { endpoints: string[]; crons: string[] }>; endpoints: string[] } {
  const factsOf = new Map(facts.map((f) => [f.filePath, f]));
  const endpoints = new Set<string>();
  const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
  for (const [origin, files] of reached) {
    const eps = new Set<string>();
    const crs = new Set<string>();
    for (const f of files) {
      if (isTestPath(f)) continue;
      const fact = factsOf.get(f);
      if (!fact) continue;
      for (const e of fact.endpoints) eps.add(e);
      for (const c of fact.crons) crs.add(c);
    }
    if (eps.size === 0 && crs.size === 0) continue;
    factsByFile[origin] = { endpoints: [...eps].sort(), crons: [...crs].sort() };
    for (const e of eps) endpoints.add(e);
  }
  return { factsByFile, endpoints: [...endpoints] };
}
