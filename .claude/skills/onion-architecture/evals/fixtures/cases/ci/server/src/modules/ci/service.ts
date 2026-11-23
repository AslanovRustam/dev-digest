import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { CiRepository } from './repository.js';
import { renderWorkflow, toInstallationDto, type InstallationDto } from './helpers.js';
import { WORKFLOW_FILENAME, type InstallBody } from './constants.js';

export interface WorkflowFile {
  path: string;
  content: string;
}

/**
 * CI service — register where an agent runs in CI and produce its workflow file.
 */
export class CiService {
  private installs: CiRepository;

  constructor(private container: Container) {
    this.installs = new CiRepository(container.db);
  }

  async list(workspaceId: string, agentId: string): Promise<InstallationDto[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.installs.listForAgent(agentId);
    return rows.map(toInstallationDto);
  }

  async install(workspaceId: string, input: InstallBody): Promise<InstallationDto> {
    await this.requireAgent(workspaceId, input.agent_id);
    const row = await this.installs.insert({
      agentId: input.agent_id,
      repo: input.repo,
      targetType: input.target_type,
    });
    return toInstallationDto(row);
  }

  async workflowFile(workspaceId: string, id: string): Promise<WorkflowFile> {
    const row = await this.installs.getById(id);
    if (!row) throw new NotFoundError('Installation not found');
    await this.requireAgent(workspaceId, row.agentId);
    return {
      path: `.github/workflows/${WORKFLOW_FILENAME}`,
      content: renderWorkflow(row.repo, row.targetType),
    };
  }

  async uninstall(workspaceId: string, id: string): Promise<void> {
    const row = await this.installs.getById(id);
    if (!row) throw new NotFoundError('Installation not found');
    await this.requireAgent(workspaceId, row.agentId);
    await this.installs.remove(id);
  }

  private async requireAgent(workspaceId: string, agentId: string): Promise<void> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
  }
}
