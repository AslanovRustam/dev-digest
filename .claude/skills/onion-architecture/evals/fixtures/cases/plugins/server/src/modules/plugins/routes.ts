import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PluginService } from './service.js';
import { PluginInstallBody, PluginToggleBody } from './constants.js';

/**
 * Plugins module — bundles installed into a workspace.
 *   GET    /plugins          → list installed plugins + workspace summary
 *   GET    /plugins/:id      → one installed plugin
 *   POST   /plugins          → record an installed plugin
 *   PATCH  /plugins/:id      → enable / disable
 *   DELETE /plugins/:id      → uninstall
 */
export default async function pluginsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new PluginService(app.container);

  app.get('/plugins', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/plugins/:id', { schema: { params: IdParams } }, async (req) => {
    await getContext(app.container, req);
    return service.get(req.params.id);
  });

  app.post('/plugins', { schema: { body: PluginInstallBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const plugin = await service.install(workspaceId, req.body);
    reply.status(201);
    return plugin;
  });

  app.patch(
    '/plugins/:id',
    { schema: { params: IdParams, body: PluginToggleBody } },
    async (req) => {
      await getContext(app.container, req);
      return service.setEnabled(req.params.id, req.body.enabled);
    },
  );

  app.delete('/plugins/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.uninstall(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
