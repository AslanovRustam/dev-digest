import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';
import { InstallBody, AgentQuery } from './constants.js';

/**
 * CI module — where an agent's review runs inside a team's pipeline.
 *   GET    /ci/installations           → installations of one agent (?agent_id=)
 *   POST   /ci/installations           → register an installation
 *   GET    /ci/installations/:id/file  → the workflow file for an installation
 *   DELETE /ci/installations/:id       → remove an installation
 */
export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.get('/ci/installations', { schema: { querystring: AgentQuery } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.query.agent_id);
  });

  app.post('/ci/installations', { schema: { body: InstallBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const created = await service.install(workspaceId, req.body);
    reply.status(201);
    return created;
  });

  app.get('/ci/installations/:id/file', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.workflowFile(workspaceId, req.params.id);
  });

  app.delete('/ci/installations/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.uninstall(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
