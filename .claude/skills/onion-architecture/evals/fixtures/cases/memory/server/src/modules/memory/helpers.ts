import { MemorySource, type MemoryItem } from '@devdigest/shared';
import { z } from 'zod';
import type { MemoryRow } from '../../db/rows.js';
import { MAX_CONTENT_CHARS, DEFAULT_CONFIDENCE } from './constants.js';

export type MemoryDto = MemoryItem & {
  id: string;
  repo_id: string | null;
  created_at: string;
  last_used_at: string | null;
};

const Sources = z.array(MemorySource);

/** Collapse whitespace and cap the length of a memory item's text. */
export function normalizeContent(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_CONTENT_CHARS
    ? `${collapsed.slice(0, MAX_CONTENT_CHARS - 1)}…`
    : collapsed;
}

/** Map a persisted memory row to the API DTO. */
export function toMemoryDto(row: MemoryRow): MemoryDto {
  const sources = Sources.safeParse(row.sources);
  return {
    id: row.id,
    repo_id: row.repoId,
    content: row.content,
    scope: row.scope,
    kind: row.kind,
    confidence: row.confidence ?? DEFAULT_CONFIDENCE,
    sources: sources.success ? sources.data : [],
    created_at: row.createdAt.toISOString(),
    last_used_at: row.lastUsedAt?.toISOString() ?? null,
  };
}
