import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DERIVE_RATE_LIMIT } from './constants.js';

/**
 * L03 — Intent layer. `:id` is the pull request.
 *   GET  /pulls/:id/intent   → stored intent + stale flag. Reads only; NEVER calls a model.
 *   POST /pulls/:id/intent   → (re-)derive: collect sources → one cheap classifier call → persist (rate-limited)
 *
 * A review run reuses / derives intent through `container.intent` (see reviews).
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Resolved through the container so tests can swap the facade (ContainerOverrides).
  const service = app.container.intent;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: DERIVE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const prId = req.params.id;
      // The service never sees Fastify: the request logger is bound here.
      return service.derive(workspaceId, prId, {
        log: (kind, msg, data) => {
          if (kind === 'error') req.log.error({ ...data, prId }, msg);
          else req.log.info({ ...data, prId }, msg);
        },
      });
    },
  );
}
