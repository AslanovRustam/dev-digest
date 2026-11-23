import type { RepoRef } from '@devdigest/shared';
import { renderWorkflow } from '../../modules/ci/helpers.js';
import { WORKFLOW_FILENAME } from '../../modules/ci/constants.js';

export interface WorkflowCommitFile {
  path: string;
  content: string;
}

/**
 * The file a GitHub Actions install commits to the repo's default branch.
 */
export function workflowCommitFile(repo: RepoRef): WorkflowCommitFile {
  return {
    path: `.github/workflows/${WORKFLOW_FILENAME}`,
    content: renderWorkflow(`${repo.owner}/${repo.name}`, 'gha'),
  };
}
