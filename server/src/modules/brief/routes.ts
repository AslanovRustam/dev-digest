import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { GENERATE_RATE_LIMIT } from './constants.js';
import { BriefService } from './service.js';

/**
 * L05 — PR Brief. `:id` is the pull request.
 *   GET  /pulls/:id/brief   → stored brief + stale flag. Reads only; NEVER calls a model.
 *   POST /pulls/:id/brief   → (re-)generate: one structured call, 409 while one is running (rate-limited)
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // One service per plugin: it holds the in-memory "generation running" lock.
  const service = new BriefService(app.container);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: GENERATE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const prId = req.params.id;
      // The service never sees Fastify: the request logger is bound here.
      return service.generate(workspaceId, prId, {
        log: (kind, msg, data) => {
          if (kind === 'error') req.log.error({ ...data, prId }, msg);
          else req.log.info({ ...data, prId }, msg);
        },
      });
    },
  );
}
