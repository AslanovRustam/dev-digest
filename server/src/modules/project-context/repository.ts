import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { RepoRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';

/**
 * Project Context data-access: the agent / skill attachment lists (paths only,
 * ordered by `position`) and who uses which path. The attachment tables carry no
 * workspace column, so every query is scoped through `agents` / `skills`.
 * Returns rows, never DTOs.
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async agentExists(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return !!row;
  }

  async skillExists(workspaceId: string, skillId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return !!row;
  }

  async agentPaths(agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId))
      .orderBy(asc(t.agentContextDocs.position));
    return rows.map((r) => r.path);
  }

  async skillPaths(skillId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(eq(t.skillContextDocs.skillId, skillId))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  /** Replace the agent's whole ordered list in ONE transaction (position = index). */
  async setAgentPaths(agentId: string, paths: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
      if (paths.length > 0) {
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId, path, position })));
      }
    });
  }

  async setSkillPaths(skillId: string, paths: readonly string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, skillId));
      if (paths.length > 0) {
        await tx
          .insert(t.skillContextDocs)
          .values(paths.map((path, position) => ({ skillId, path, position })));
      }
    });
  }

  /**
   * The documents an agent inherits: links enabled for the agent × skills
   * enabled globally — the same set that reaches its prompt — in the agent's
   * skill order, then each skill's own order.
   */
  async skillPathsForAgent(
    agentId: string,
  ): Promise<{ skillId: string; skillName: string; path: string }[]> {
    return this.db
      .select({
        skillId: t.skills.id,
        skillName: t.skills.name,
        path: t.skillContextDocs.path,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skillContextDocs.position));
  }

  /** Every (agent, path) use in the workspace — direct, or via an enabled skill link. */
  async usagePairs(workspaceId: string): Promise<{ agentId: string; path: string }[]> {
    const [direct, inherited] = await Promise.all([
      this.db
        .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
        .where(eq(t.agents.workspaceId, workspaceId)),
      this.db
        .select({ agentId: t.agentSkills.agentId, path: t.skillContextDocs.path })
        .from(t.agentSkills)
        .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
        .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
        .where(
          and(
            eq(t.skills.workspaceId, workspaceId),
            eq(t.agentSkills.enabled, true),
            eq(t.skills.enabled, true),
          ),
        ),
    ]);
    return [...direct, ...inherited];
  }
}
