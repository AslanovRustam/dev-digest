import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow, RepoRow } from '../../db/rows.js';

/**
 * Conventions data-access. Owns `conventions` and `convention_scans`; reads
 * `repos` (the scanned repo) and `skills` (the name of the skill a candidate
 * was merged into). Workspace-scoped throughout. Returns rows, never DTOs.
 */

export type { ConventionRow, ConventionScanRow };

export interface ConventionWithSkill {
  row: ConventionRow;
  skillName: string | null;
}

export interface InsertScan {
  workspaceId: string;
  repoId: string;
  sourceSha: string;
  sampleFiles: string[];
  model: string;
  proposed: number;
  droppedUngrounded: number;
  droppedDuplicate: number;
  costUsd: number | null;
}

export interface InsertCandidate {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

export interface ConventionPatchRow {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /** All candidates of a repo (every scan), newest first, with the merged skill's name. */
  async list(workspaceId: string, repoId: string): Promise<ConventionWithSkill[]> {
    const rows = await this.db
      .select({ row: t.conventions, skillName: t.skills.name })
      .from(t.conventions)
      .leftJoin(t.skills, eq(t.conventions.skillId, t.skills.id))
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.createdAt), desc(t.conventions.confidence));
    return rows.map((r) => ({ row: r.row, skillName: r.skillName ?? null }));
  }

  /** Accepted and rejected candidates — the maintainer's decisions a re-scan must respect. */
  async listTriaged(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          ne(t.conventions.status, 'pending'),
        ),
      );
  }

  async getByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  /**
   * Persist one scan as a unit: drop the repo's still-pending candidates (a new
   * scan supersedes them), record the scan, insert its verified candidates as
   * `pending`. Accepted and rejected rows are never touched.
   */
  async replacePending(
    scan: InsertScan,
    candidates: InsertCandidate[],
  ): Promise<ConventionScanRow> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, scan.workspaceId),
            eq(t.conventions.repoId, scan.repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      const [row] = await tx.insert(t.conventionScans).values(scan).returning();
      if (candidates.length > 0) {
        await tx.insert(t.conventions).values(
          candidates.map((c) => ({
            ...c,
            workspaceId: scan.workspaceId,
            repoId: scan.repoId,
            scanId: row!.id,
            status: 'pending' as const,
          })),
        );
      }
      return row!;
    });
  }

  async update(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatchRow,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.id, id),
        ),
      )
      .returning();
    return row;
  }

  /** Set one status on many candidates; returns how many rows changed. */
  async setStatus(
    workspaceId: string,
    repoId: string,
    ids: string[],
    status: ConventionStatus,
  ): Promise<number> {
    const rows = await this.db
      .update(t.conventions)
      .set({ status, updatedAt: sql`now()` })
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      )
      .returning({ id: t.conventions.id });
    return rows.length;
  }

  /** Mark candidates as merged into `skillId`. */
  async markInSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId, updatedAt: sql`now()` })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }
}
