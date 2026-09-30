import { and, asc, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import type { SkillSource, SkillType } from '@devdigest/shared';
import type { Db, DbOrTx } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import { COMPLETED_RUN_STATUS, INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. Owns `skills` and `skill_versions`; reads `agent_skills`,
 * `agent_runs`, `run_traces`, `reviews` and `findings` for the correlational
 * stats. Workspace-scoped throughout. Returns rows, never DTOs.
 */

export type { SkillRow, SkillVersionRow };

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export interface SkillRunCounts {
  skillId: string;
  total: number;
  pulled: number;
}

export interface SkillFindingCounts {
  skillId: string;
  findings: number;
  accepted: number;
  dismissed: number;
}

export interface SkillAgentRow {
  id: string;
  name: string;
  agentEnabled: boolean;
  linkEnabled: boolean;
}

/**
 * True when a run's trace injected the linked skill: `run_traces.trace ->
 * prompt_assembly -> skill_blocks` contains `[{"skill_id": <id>}]`. Evaluated
 * per (agent_skills, agent_runs, run_traces) join row; a run with no trace
 * yields NULL, which `filter` / `where` treat as false.
 */
const pulledBySkill = sql`${t.runTraces.trace} @> jsonb_build_object(
  'prompt_assembly', jsonb_build_object(
    'skill_blocks', jsonb_build_array(jsonb_build_object('skill_id', ${t.agentSkills.skillId}::text))))`;

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /** Insert a skill and its v1 snapshot as one unit. */
  async insert(values: InsertSkill, note: string): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({ ...values, version: INITIAL_SKILL_VERSION })
        .returning();
      await snapshot(tx, row!, note);
      return row!;
    });
  }

  /**
   * Apply a patch. With a `versionNote` the version is bumped and the new
   * content snapshotted in the same transaction; without one (an `enabled`
   * toggle) the version stays put.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    versionNote: string | null,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({
          ...patch,
          ...(versionNote !== null ? { version: sql`${t.skills.version} + 1` } : {}),
        })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (row && versionNote !== null) await snapshot(tx, row, versionNote);
      return row;
    });
  }

  /** Delete a skill; versions and agent links cascade. False when absent. */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions -----------------------------------------------------

  /** Snapshots of a skill, newest first. Caller checks workspace ownership. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  // ---- usage + stats ------------------------------------------------------

  /** Number of agents linking each skill (any per-agent state). */
  async agentCounts(workspaceId: string, skillId?: string): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        skillId: t.agentSkills.skillId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .where(and(eq(t.skills.workspaceId, workspaceId), skillFilter(skillId)))
      .groupBy(t.agentSkills.skillId);
    return new Map(rows.map((r) => [r.skillId, r.count]));
  }

  /** The agents linking a skill, with both switches. */
  async linkingAgents(workspaceId: string, skillId: string): Promise<SkillAgentRow[]> {
    return this.db
      .select({
        id: t.agents.id,
        name: t.agents.name,
        agentEnabled: t.agents.enabled,
        linkEnabled: t.agentSkills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.skillId, skillId)))
      .orderBy(asc(t.agents.name));
  }

  /**
   * Per skill: completed runs (since `since`) of the agents linking it, and how
   * many of those carried the skill in their trace's `skill_blocks`.
   */
  async runCounts(workspaceId: string, since: Date, skillId?: string): Promise<SkillRunCounts[]> {
    return this.db
      .select({
        skillId: t.agentSkills.skillId,
        total: sql<number>`count(*)`.mapWith(Number),
        pulled: sql<number>`count(*) filter (where ${pulledBySkill})`.mapWith(Number),
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.agentId, t.agentSkills.agentId))
      .leftJoin(t.runTraces, eq(t.runTraces.runId, t.agentRuns.id))
      .where(and(...completedRunsSince(workspaceId, since), skillFilter(skillId)))
      .groupBy(t.agentSkills.skillId);
  }

  /** Per skill: findings of the reviews produced by its pulled runs. */
  async findingCounts(
    workspaceId: string,
    since: Date,
    skillId?: string,
  ): Promise<SkillFindingCounts[]> {
    return this.db
      .select({
        skillId: t.agentSkills.skillId,
        findings: sql<number>`count(*)`.mapWith(Number),
        accepted: sql<number>`count(*) filter (where ${t.findings.acceptedAt} is not null)`.mapWith(
          Number,
        ),
        dismissed: sql<number>`count(*) filter (where ${t.findings.dismissedAt} is not null)`.mapWith(
          Number,
        ),
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.agentId, t.agentSkills.agentId))
      .innerJoin(t.runTraces, and(eq(t.runTraces.runId, t.agentRuns.id), pulledBySkill))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(pulledFindingsWhere(workspaceId, since, skillId))
      .groupBy(t.agentSkills.skillId);
  }

  /** Findings of one skill's pulled runs, counted by category (largest first). */
  async findingCategories(
    workspaceId: string,
    since: Date,
    skillId: string,
  ): Promise<{ category: string; count: number }[]> {
    return this.db
      .select({
        category: t.findings.category,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.agentSkills.skillId))
      .innerJoin(t.agentRuns, eq(t.agentRuns.agentId, t.agentSkills.agentId))
      .innerJoin(t.runTraces, and(eq(t.runTraces.runId, t.agentRuns.id), pulledBySkill))
      .innerJoin(t.reviews, eq(t.reviews.runId, t.agentRuns.id))
      .innerJoin(t.findings, eq(t.findings.reviewId, t.reviews.id))
      .where(pulledFindingsWhere(workspaceId, since, skillId))
      .groupBy(t.findings.category)
      .orderBy(desc(sql`count(*)`), asc(t.findings.category));
  }
}

/** Snapshot a skill's current content as `row.version`. */
async function snapshot(db: DbOrTx, row: SkillRow, note: string): Promise<void> {
  await db.insert(t.skillVersions).values({
    skillId: row.id,
    version: row.version,
    note,
    name: row.name,
    description: row.description,
    type: row.type,
    body: row.body,
  });
}

function skillFilter(skillId: string | undefined): SQL | undefined {
  return skillId !== undefined ? eq(t.agentSkills.skillId, skillId) : undefined;
}

function pulledFindingsWhere(workspaceId: string, since: Date, skillId?: string): SQL | undefined {
  return and(
    ...completedRunsSince(workspaceId, since),
    eq(t.reviews.workspaceId, workspaceId),
    skillFilter(skillId),
  );
}

function completedRunsSince(workspaceId: string, since: Date): SQL[] {
  return [
    eq(t.skills.workspaceId, workspaceId),
    eq(t.agentRuns.workspaceId, workspaceId),
    eq(t.agentRuns.status, COMPLETED_RUN_STATUS),
    gte(t.agentRuns.ranAt, since),
  ];
}
