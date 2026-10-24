/** `GET /pulls/:id/blast` — the ripgrep fallback scans the repo clone, so the route is rate-limited. */
export const BLAST_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

/** Cap on `changed_symbols` listed in the response; `stats.symbols` still counts all of them. */
export const MAX_CHANGED_SYMBOLS_LISTED = 200;
