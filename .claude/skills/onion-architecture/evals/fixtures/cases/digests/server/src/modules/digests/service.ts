import type { FastifyBaseLogger } from 'fastify';
import { and, eq } from 'drizzle-orm';
import type { Digest } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { DigestRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import { OctokitGitHubClient } from '../../adapters/github/octokit.js';
import { REFRESH_JOB_KIND } from '../repo-intel/constants.js';
import { DigestRepository } from './repository.js';
import { renderDigest, resolvePeriod, toDigestDto } from './helpers.js';
import { DIGEST_JOB_KIND, type DigestBuildBody } from './constants.js';

interface DigestJobPayload {
  workspaceId: string;
  input: DigestBuildBody;
}

/**
 * Digests service — builds and stores the periodic PR summary.
 */
export class DigestService {
  private digests: DigestRepository;

  constructor(
    private container: Container,
    private log: FastifyBaseLogger,
  ) {
    this.digests = new DigestRepository(container.db);
  }

  registerJobHandler(): void {
    this.container.jobs.register(DIGEST_JOB_KIND, async (payload) => {
      const { workspaceId, input } = payload as DigestJobPayload;
      await this.build(workspaceId, input);
    });
  }

  async list(workspaceId: string): Promise<Digest[]> {
    const rows = await this.digests.list(workspaceId);
    return rows.map(toDigestDto);
  }

  async build(workspaceId: string, input: DigestBuildBody): Promise<Digest> {
    const period = resolvePeriod(input.period_start, input.period_end, new Date());

    const github = new OctokitGitHubClient(process.env.GITHUB_TOKEN ?? '');
    const pulls = await github.listPullRequests({ owner: input.owner, name: input.name });
    this.log.info({ repo: `${input.owner}/${input.name}`, pulls: pulls.length }, 'building digest');

    const row = await this.digests.insert({
      workspaceId,
      periodStart: period.start,
      periodEnd: period.end,
      bodyMd: renderDigest(`${input.owner}/${input.name}`, period, pulls),
    });

    if (input.repo_id) {
      try {
        await this.container.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, { repoId: input.repo_id });
      } catch (err) {
        this.log.warn({ err }, 'refresh not enqueued after digest build');
      }
    }

    return toDigestDto(row);
  }

  async markDelivered(workspaceId: string, id: string, channel: string): Promise<Digest> {
    const existing: DigestRow | undefined = await this.digests.getById(workspaceId, id);
    if (!existing) throw new NotFoundError('Digest not found');

    const [row] = await this.container.db
      .update(t.digests)
      .set({ deliveredTo: channel })
      .where(and(eq(t.digests.workspaceId, workspaceId), eq(t.digests.id, id)))
      .returning();
    return toDigestDto(row!);
  }
}
