import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastRepository } from './repository.js';
import { toBlastRadiusResponse } from './helpers.js';

/**
 * Blast radius for a PR: the changed files' symbols, their callers and the
 * endpoints / crons behind them. Reads the precomputed repo-intel index through
 * `container.repoIntel` — no model call, no re-analysis.
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const paths = await this.repo.listChangedPaths(workspaceId, prId);
    const [blast, state] = await Promise.all([
      this.container.repoIntel.getBlastRadius(pull.repoId, paths),
      this.container.repoIntel.getIndexState(pull.repoId),
    ]);
    return toBlastRadiusResponse(blast, state, this.container.config.repoIntelEnabled);
  }
}
