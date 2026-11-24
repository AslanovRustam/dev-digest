import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { DigestService } from './service.js';
import { DigestBuildBody, DigestDeliverBody } from './constants.js';

/**
 * Digests module — a periodic markdown summary of a repo's pull requests.
 *   GET  /digests              → list digests
 *   POST /digests              → build a digest for a repo and period
 *   POST /digests/:id/deliver  → mark a digest as delivered
 */
export default async function digestsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new DigestService(app.container, app.log);

  service.registerJobHandler();

  app.get('/digests', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/digests', { schema: { body: DigestBuildBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const digest = await service.build(workspaceId, req.body);
    reply.status(201);
    return digest;
  });

  app.post(
    '/digests/:id/deliver',
    { schema: { params: IdParams, body: DigestDeliverBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.markDelivered(workspaceId, req.params.id, req.body.channel);
    },
  );
}
