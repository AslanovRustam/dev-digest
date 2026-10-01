import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index, check } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One Conventions Extractor run over a repo: what was sampled, at which commit,
 * by which model, and how many proposals the evidence gate let through. The
 * commit sha pins every candidate's GitHub evidence link.
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    sourceSha: text('source_sha').notNull(),
    sampleFiles: jsonb('sample_files').$type<string[]>().notNull(),
    model: text('model').notNull(),
    proposed: integer('proposed').notNull().default(0),
    droppedUngrounded: integer('dropped_ungrounded').notNull().default(0),
    droppedDuplicate: integer('dropped_duplicate').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
    createdAt: now(),
  },
  (t) => ({
    repoIdx: index('convention_scans_repo_idx').on(t.repoId, t.createdAt),
    wsIdx: index('convention_scans_ws_idx').on(t.workspaceId),
  }),
);

/**
 * Convention categories — mirrors `ConventionCategory` in vendor/shared (the
 * schema may not import contracts). Drives both the column type and its CHECK.
 */
export const CONVENTION_CATEGORIES = [
  'naming',
  'async',
  'error-handling',
  'imports',
  'architecture',
  'typing',
  'testing',
  'style',
  'api',
  'other',
] as const;

/**
 * A convention candidate. Only evidence-verified candidates are stored. Triage
 * is three-state: a re-scan replaces `pending` rows only, so an accepted or
 * rejected rule survives it. `skill_id` marks a candidate already merged into
 * a skill.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    // A scan is provenance, not the owner: deleting one must not take triaged
    // or skill-merged conventions with it (the evidence link just loses its sha).
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category', { enum: CONVENTION_CATEGORIES }).notNull().default('other'),
    rule: text('rule').notNull(),
    // Only evidence-verified candidates are stored, so evidence is mandatory.
    evidencePath: text('evidence_path').notNull(),
    evidenceStartLine: integer('evidence_start_line').notNull(),
    evidenceEndLine: integer('evidence_end_line').notNull(),
    evidenceSnippet: text('evidence_snippet').notNull(),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    repoIdx: index('conventions_repo_idx').on(t.repoId),
    // FK columns are not indexed by Postgres; deleting a scan or a
    // skill (both set null) would otherwise scan the whole table.
    scanIdx: index('conventions_scan_idx').on(t.scanId),
    skillIdx: index('conventions_skill_idx').on(t.skillId),
    // The enums above narrow only the TS type — these make the DB refuse drift.
    evidenceLinesChk: check(
      'conventions_evidence_lines_chk',
      sql`${t.evidenceStartLine} >= 1 and ${t.evidenceEndLine} >= ${t.evidenceStartLine}`,
    ),
    statusChk: check('conventions_status_chk', sql`${t.status} in ('pending', 'accepted', 'rejected')`),
    categoryChk: check(
      'conventions_category_chk',
      sql`${t.category} in (${sql.raw(CONVENTION_CATEGORIES.map((c) => `'${c}'`).join(', '))})`,
    ),
  }),
);
