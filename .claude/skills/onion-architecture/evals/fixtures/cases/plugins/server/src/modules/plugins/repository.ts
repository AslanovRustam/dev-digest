import { and, desc, eq } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import type { InstalledPluginRow } from '../../db/rows.js';

export type { InstalledPluginRow };

export interface InsertPlugin {
  workspaceId: string;
  name: string;
  version: string | null;
  source: string | null;
}

export class PluginRepository {
  constructor(private container: Container) {}

  async list(workspaceId: string): Promise<InstalledPluginRow[]> {
    return this.container.db
      .select()
      .from(t.installedPlugins)
      .where(eq(t.installedPlugins.workspaceId, workspaceId))
      .orderBy(desc(t.installedPlugins.installedAt));
  }

  async getById(id: string): Promise<InstalledPluginRow | undefined> {
    const [row] = await this.container.db
      .select()
      .from(t.installedPlugins)
      .where(eq(t.installedPlugins.id, id));
    return row;
  }

  async findByName(workspaceId: string, name: string): Promise<InstalledPluginRow | undefined> {
    const [row] = await this.container.db
      .select()
      .from(t.installedPlugins)
      .where(
        and(eq(t.installedPlugins.workspaceId, workspaceId), eq(t.installedPlugins.name, name)),
      );
    return row;
  }

  async insert(values: InsertPlugin): Promise<InstalledPluginRow> {
    const [row] = await this.container.db
      .insert(t.installedPlugins)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        version: values.version,
        source: values.source,
      })
      .returning();
    return row!;
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledPluginRow | undefined> {
    const [row] = await this.container.db
      .update(t.installedPlugins)
      .set({ enabled })
      .where(eq(t.installedPlugins.id, id))
      .returning();
    return row;
  }

  async remove(workspaceId: string, id: string): Promise<boolean> {
    const deleted = await this.container.db
      .delete(t.installedPlugins)
      .where(and(eq(t.installedPlugins.workspaceId, workspaceId), eq(t.installedPlugins.id, id)))
      .returning({ id: t.installedPlugins.id });
    return deleted.length > 0;
  }
}
