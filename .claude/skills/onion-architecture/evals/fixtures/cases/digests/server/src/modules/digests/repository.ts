import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { DigestRow } from '../../db/rows.js';

export type { DigestRow };

export interface InsertDigest {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  bodyMd: string;
}

export class DigestRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<DigestRow[]> {
    return this.db
      .select()
      .from(t.digests)
      .where(eq(t.digests.workspaceId, workspaceId))
      .orderBy(desc(t.digests.periodEnd));
  }

  async getById(workspaceId: string, id: string): Promise<DigestRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.digests)
      .where(and(eq(t.digests.workspaceId, workspaceId), eq(t.digests.id, id)));
    return row;
  }

  async insert(values: InsertDigest): Promise<DigestRow> {
    const [row] = await this.db
      .insert(t.digests)
      .values({
        workspaceId: values.workspaceId,
        periodStart: values.periodStart,
        periodEnd: values.periodEnd,
        bodyMd: values.bodyMd,
      })
      .returning();
    return row!;
  }
}
