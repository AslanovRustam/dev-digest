import { z } from 'zod';

/**
 * Project Context (L05) — the repo's markdown documents, attached to agents and
 * skills by path and inlined into every review run as untrusted text.
 *
 *  - GET  /repos/:id/context              → ContextDocList
 *  - GET  /repos/:id/context/document     → ContextDocument (?path=)
 *  - POST /repos/:id/context/rescan       → ContextDocList
 *  - POST /repos/:id/context/documents    → ContextSaveResult (new branch + PR)
 *  - GET|PUT /agents/:id/context, /skills/:id/context → ContextAttachments
 *
 * Paths are repo-root-relative and always use `/`. Attachments store paths,
 * never text — the run reads the clone's working tree (default branch).
 */

/** The nearest search-root folder a document sits under. */
export const ContextDocType = z.enum(['specs', 'docs', 'insights']);
export type ContextDocType = z.infer<typeof ContextDocType>;

export const ContextDocSummary = z.object({
  path: z.string(),
  type: ContextDocType,
  /** ≈ tokens of the full text; null when the file is too large to read. */
  tokens: z.number().int().nullable(),
  too_large: z.boolean(),
  /** Agents that get this document directly or via an enabled skill link. */
  used_by_agents: z.number().int(),
});
export type ContextDocSummary = z.infer<typeof ContextDocSummary>;

export const ContextDocList = z.object({
  state: z.enum(['ok', 'not_cloned']),
  /** When the clone was last walked (ISO); null when not cloned. */
  scanned_at: z.string().nullable(),
  /** Matching documents in the clone — may exceed `documents.length` (list cap). */
  total: z.number().int(),
  /** Search-root folder names, shown in the empty state. */
  roots: z.array(z.string()),
  documents: z.array(ContextDocSummary),
});
export type ContextDocList = z.infer<typeof ContextDocList>;

export const ContextDocQuery = z.object({ path: z.string().min(1).max(1024) });
export type ContextDocQuery = z.infer<typeof ContextDocQuery>;

export const ContextDocument = z.object({
  path: z.string(),
  type: ContextDocType,
  text: z.string(),
  tokens: z.number().int(),
  /** sha256 of the LF-normalised text — the base version of an update. */
  version: z.string(),
  used_by_agents: z.number().int(),
});
export type ContextDocument = z.infer<typeof ContextDocument>;

/** `unknown` = no active repo / no clone, so the path cannot be checked. */
export const ContextAttachmentStatus = z.enum(['present', 'not_in_repo', 'too_large', 'unknown']);
export type ContextAttachmentStatus = z.infer<typeof ContextAttachmentStatus>;

export const ContextAttachmentItem = z.object({
  path: z.string(),
  /** Name of the skill the row is inherited from; null = own attachment. */
  via_skill: z.string().nullable(),
  status: ContextAttachmentStatus,
  /** Tokens a run would inject for it; null when it cannot be counted. */
  tokens: z.number().int().nullable(),
  truncated: z.boolean(),
  dropped: z.boolean(),
});
export type ContextAttachmentItem = z.infer<typeof ContextAttachmentItem>;

export const ContextAttachments = z.object({
  /** Own rows first in their order, then inherited ones (agent only). */
  items: z.array(ContextAttachmentItem),
  /** Tokens a run on the repo would inject — equals the trace total. */
  total_tokens: z.number().int(),
  /** Tokens of the merged set before the run budget; above `budget` = warning. */
  requested_tokens: z.number().int(),
  /** Per-run token budget for project context. */
  budget: z.number().int(),
});
export type ContextAttachments = z.infer<typeof ContextAttachments>;

export const ContextAttachmentsQuery = z.object({ repo_id: z.string().uuid().optional() });
export type ContextAttachmentsQuery = z.infer<typeof ContextAttachmentsQuery>;

export const ContextAttachmentsSet = z.object({
  /** The whole ordered list; path rules (relative, `.md`, unique) are checked server-side. */
  paths: z.array(z.string().min(1).max(1024)).max(100),
});
export type ContextAttachmentsSet = z.infer<typeof ContextAttachmentsSet>;

export const ContextSaveRequest = z.object({
  path: z.string().min(1).max(1024),
  text: z.string(),
  mode: z.enum(['create', 'update']),
  /** `ContextDocument.version` the edit started from; required for `update`. */
  base_version: z.string().optional(),
  /** Commit message and PR title; defaults to `docs: update|add <path>`. */
  message: z.string().max(200).optional(),
});
export type ContextSaveRequest = z.infer<typeof ContextSaveRequest>;

export const ContextSaveResult = z.object({
  branch: z.string(),
  pr_number: z.number().int(),
  pr_url: z.string(),
});
export type ContextSaveResult = z.infer<typeof ContextSaveResult>;
