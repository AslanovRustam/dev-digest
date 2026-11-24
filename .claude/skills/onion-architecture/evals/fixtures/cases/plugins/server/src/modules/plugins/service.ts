import type { InstalledPlugin } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { PluginRepository } from './repository.js';
import { toPluginDto, isNewerVersion } from './helpers.js';
import type { PluginInstallBody } from './constants.js';

export interface PluginList {
  plugins: InstalledPlugin[];
  enabled_agents: number;
}

/**
 * Plugins service — install / list / toggle / uninstall.
 */
export class PluginService {
  private plugins: PluginRepository;

  constructor(private container: Container) {
    this.plugins = new PluginRepository(container);
  }

  async list(workspaceId: string): Promise<PluginList> {
    const [rows, agents] = await Promise.all([
      this.plugins.list(workspaceId),
      this.container.agentsRepo.listEnabled(workspaceId),
    ]);
    return { plugins: rows.map(toPluginDto), enabled_agents: agents.length };
  }

  async get(id: string): Promise<InstalledPlugin> {
    const row = await this.plugins.getById(id);
    if (!row) throw new NotFoundError('Plugin not found');
    return toPluginDto(row);
  }

  async install(workspaceId: string, input: PluginInstallBody): Promise<InstalledPlugin> {
    const existing = await this.plugins.findByName(workspaceId, input.name);
    if (existing && !isNewerVersion(existing.version, input.version ?? null)) {
      throw new AppError(
        'plugin_already_installed',
        `Plugin '${input.name}' is already installed at the same or a newer version`,
        409,
      );
    }
    if (existing) await this.plugins.remove(workspaceId, existing.id);

    const row = await this.plugins.insert({
      workspaceId,
      name: input.name,
      version: input.version ?? null,
      source: input.source ?? null,
    });
    return toPluginDto(row);
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledPlugin> {
    const row = await this.plugins.setEnabled(id, enabled);
    if (!row) throw new NotFoundError('Plugin not found');
    return toPluginDto(row);
  }

  async uninstall(workspaceId: string, id: string): Promise<void> {
    const removed = await this.plugins.remove(workspaceId, id);
    if (!removed) throw new NotFoundError('Plugin not found');
  }
}
