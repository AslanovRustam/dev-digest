import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';
import { BLAST_RATE_LIMIT } from './constants.js';

/**
 * L05 — Blast radius. `:id` is the pull request.
 *   GET /pulls/:id/blast → changed symbols → callers → endpoints / crons, plus honest degradation.
 * Reads the precomputed repo index; NEVER calls a model. Rate-limited: the fallback path scans the clone.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    {
      schema: { params: IdParams, response: { 200: BlastRadiusResponse } },
      config: { rateLimit: BLAST_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
