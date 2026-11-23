import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { and, eq } from 'drizzle-orm';
import { MemoryItem } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MemoryService } from './service.js';
import { toMemoryDto } from './helpers.js';

/**
 * Memory module — things the reviewer has learned about a repo.
 *   GET    /repos/:id/memory  → list items for a repo
 *   GET    /memory/:id        → one item
 *   POST   /repos/:id/memory  → add an item
 *   DELETE /memory/:id        → remove an item
 */
export default async function memoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new MemoryService(app.container);

  app.get('/repos/:id/memory', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get('/memory/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const [row] = await app.container.db
      .select()
      .from(t.memory)
      .where(and(eq(t.memory.workspaceId, workspaceId), eq(t.memory.id, req.params.id)));
    if (!row) throw new NotFoundError('Memory item not found');
    return toMemoryDto(row);
  });

  app.post('/repos/:id/memory', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const input = MemoryItem.parse(req.body);
    const item = await service.add(workspaceId, req.params.id, input);
    reply.status(201);
    return item;
  });

  app.delete('/memory/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
