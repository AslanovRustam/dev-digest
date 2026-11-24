import { desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiInstallationRow } from '../../db/rows.js';

export type { CiInstallationRow };

export interface InsertInstallation {
  agentId: string;
  repo: string;
  targetType: CiInstallationRow['targetType'];
}

export class CiRepository {
  constructor(private db: Db) {}

  async listForAgent(agentId: string): Promise<CiInstallationRow[]> {
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(desc(t.ciInstallations.installedAt));
  }

  async getById(id: string): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.id, id));
    return row;
  }

  async insert(values: InsertInstallation): Promise<CiInstallationRow> {
    const [row] = await this.db.insert(t.ciInstallations).values(values).returning();
    return row!;
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(t.ciInstallations).where(eq(t.ciInstallations.id, id));
  }
}
