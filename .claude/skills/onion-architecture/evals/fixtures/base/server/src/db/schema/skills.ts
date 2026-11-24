import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  primaryKey,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';

export const skills = pgTable('skills', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }).notNull(),
  source: text('source', {
    enum: ['manual', 'imported_url', 'imported_file', 'extracted', 'community'],
  }).notNull(),
  body: text('body').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(1),
  evidenceFiles: jsonb('evidence_files').$type<string[]>(),
  createdAt: now(),
});

export const skillVersions = pgTable(
  'skill_versions',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    // "What changed?" note shown in the Versions tab.
    note: text('note').notNull().default(''),
    // Content snapshot beside the body; null on rows written before L02.
    name: text('name'),
    description: text('description'),
    type: text('type', { enum: ['rubric', 'convention', 'security', 'custom'] }),
    createdAt: now(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.skillId, t.version] }) }),
);

// Project Context (L05): a skill's attached repo documents, inherited by every
// agent with an enabled link to it. Paths only, in order; not versioned.
export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    position: integer('position').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.path] }),
    positionUq: uniqueIndex('skill_context_docs_position_uq').on(t.skillId, t.position),
    pathChk: check('skill_context_docs_path_chk', sql`char_length(${t.path}) between 1 and 1024`),
    positionChk: check('skill_context_docs_position_chk', sql`${t.position} >= 0`),
  }),
);
