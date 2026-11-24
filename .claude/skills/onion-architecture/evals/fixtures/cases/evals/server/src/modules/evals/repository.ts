import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalCaseRow, EvalRunRow } from '../../db/rows.js';

export type { EvalCaseRow, EvalRunRow };

export interface CaseValues {
  ownerKind: EvalCaseRow['ownerKind'];
  ownerId: string;
  name: string;
  inputDiff: string | null;
  notes: string | null;
}

export interface InsertCase extends CaseValues {
  workspaceId: string;
}

export interface InsertRun {
  caseId: string;
  pass: boolean;
  recall: number;
  precision: number;
}

export class EvalRepository {
  constructor(private db: Db) {}

  async listCases(workspaceId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.workspaceId, workspaceId))
      .orderBy(desc(t.evalCases.name));
  }

  async getCase(workspaceId: string, id: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)));
    return row;
  }

  async insertCase(values: InsertCase): Promise<EvalCaseRow> {
    const [row] = await this.db.insert(t.evalCases).values(values).returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    id: string,
    values: CaseValues,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set(values)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, id)))
      .returning({ id: t.evalCases.id });
    return deleted.length > 0;
  }

  async insertRun(values: InsertRun): Promise<EvalRunRow> {
    const [row] = await this.db.insert(t.evalRuns).values(values).returning();
    return row!;
  }

  async deleteRunsForCase(caseId: string): Promise<void> {
    await this.db.delete(t.evalRuns).where(eq(t.evalRuns.caseId, caseId));
  }
}
