import type { Repo } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { RepoService } from '../repos/service.js';

/**
 * Resolve the repository a pull request belongs to, or throw a 404.
 * Shared by the modules that need the owner/name of a pull's repo.
 */
export async function requireRepoById(
  container: Container,
  workspaceId: string,
  repoId: string,
): Promise<Repo> {
  const repos = await new RepoService(container).list(workspaceId);
  const repo = repos.find((r) => r.id === repoId);
  if (!repo) throw new NotFoundError('Repo not found');
  return repo;
}
