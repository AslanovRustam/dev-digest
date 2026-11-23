import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';
import { EvalCaseBody, ScoreBody } from './constants.js';

/**
 * Evals module — saved review cases and how well an agent's findings match them.
 *   GET    /evals              → list cases
 *   POST   /evals              → create a case
 *   PUT    /evals/:id          → replace a case (its old runs are discarded)
 *   POST   /evals/:id/score    → score a set of findings against a case
 *   DELETE /evals/:id          → remove a case
 */
export default async function evalsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.get('/evals', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/evals', { schema: { body: EvalCaseBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const created = await service.create(workspaceId, req.body);
    reply.status(201);
    return created;
  });

  app.put('/evals/:id', { schema: { params: IdParams, body: EvalCaseBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.replace(workspaceId, req.params.id, req.body);
  });

  app.post('/evals/:id/score', { schema: { params: IdParams, body: ScoreBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.score(workspaceId, req.params.id, req.body.findings);
  });

  app.delete('/evals/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
