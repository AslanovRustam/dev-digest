import type { MemoryItem } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { RepoService } from '../repos/service.js';
import { MemoryRepository } from './repository.js';
import { toMemoryDto, normalizeContent, type MemoryDto } from './helpers.js';
import { MAX_ITEMS_PER_REPO, DEFAULT_CONFIDENCE } from './constants.js';

/**
 * Memory service — add / list / remove memory items for a repo.
 */
export class MemoryService {
  private memory: MemoryRepository;
  private repos: RepoService;

  constructor(private container: Container) {
    this.memory = new MemoryRepository(container.db);
    this.repos = new RepoService(container);
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<MemoryDto[]> {
    await this.requireRepo(workspaceId, repoId);
    const rows = await this.memory.listForRepo(workspaceId, repoId);
    return rows.map(toMemoryDto);
  }

  async add(workspaceId: string, repoId: string, input: MemoryItem): Promise<MemoryDto> {
    await this.requireRepo(workspaceId, repoId);

    const count = await this.memory.countForRepo(workspaceId, repoId);
    if (count >= MAX_ITEMS_PER_REPO) {
      throw new AppError(
        'memory_limit_reached',
        `A repo can hold at most ${MAX_ITEMS_PER_REPO} memory items`,
        409,
      );
    }

    const row = await this.memory.insert({
      workspaceId,
      repoId,
      scope: input.scope,
      kind: input.kind,
      content: normalizeContent(input.content),
      confidence: input.confidence ?? DEFAULT_CONFIDENCE,
      sources: input.sources,
    });
    return toMemoryDto(row);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = await this.memory.remove(workspaceId, id);
    if (!removed) throw new NotFoundError('Memory item not found');
  }

  private async requireRepo(workspaceId: string, repoId: string): Promise<void> {
    const repos = await this.repos.list(workspaceId);
    if (!repos.some((r) => r.id === repoId)) throw new NotFoundError('Repo not found');
  }
}
