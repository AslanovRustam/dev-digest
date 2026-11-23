import { and, count, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { MemoryRow } from '../../db/rows.js';

export type { MemoryRow };

export interface InsertMemory {
  workspaceId: string;
  repoId: string;
  scope: MemoryRow['scope'];
  kind: MemoryRow['kind'];
  content: string;
  confidence: number;
  sources: unknown;
}

export class MemoryRepository {
  constructor(private db: Db) {}

  async listForRepo(workspaceId: string, repoId: string): Promise<MemoryRow[]> {
    return this.db
      .select()
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.repoId, repoId)))
      .orderBy(desc(t.memory.createdAt));
  }

  async countForRepo(workspaceId: string, repoId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.repoId, repoId)));
    return row?.n ?? 0;
  }

  async insert(values: InsertMemory): Promise<MemoryRow> {
    const [row] = await this.db
      .insert(t.memory)
      .values({
        workspaceId: values.workspaceId,
        repoId: values.repoId,
        scope: values.scope,
        kind: values.kind,
        content: values.content,
        confidence: values.confidence,
        sources: values.sources,
      })
      .returning();
    return row!;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.id, id)))
      .returning({ id: t.memory.id });
    return deleted.length > 0;
  }
}
