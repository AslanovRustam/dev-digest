import type { CiInstallationRow } from '../../db/rows.js';
import { CI_TARGET_TYPES, WORKFLOW_FILENAME } from './constants.js';

export interface InstallationDto {
  id: string;
  agent_id: string;
  repo: string;
  target_type: (typeof CI_TARGET_TYPES)[number];
  installed_at: string;
}

/** Render the workflow text a team commits to run the agent in CI. */
export function renderWorkflow(repo: string, target: string): string {
  return [
    `# ${WORKFLOW_FILENAME} — generated for ${repo} (${target})`,
    'name: devdigest-review',
    'on: [pull_request]',
    'jobs:',
    '  review:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - run: npx devdigest review --pr ${{ github.event.pull_request.number }}',
  ].join('\n');
}

/** Map a persisted installation row to the API DTO. */
export function toInstallationDto(row: CiInstallationRow): InstallationDto {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    installed_at: row.installedAt.toISOString(),
  };
}
