import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionBulkStatus,
  ConventionPatch,
  ConventionSkillCreate,
  ConventionSkillDraftRequest,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';
import { EXTRACT_RATE_LIMIT } from './constants.js';

const ConventionParams = z.object({
  id: z.string().uuid(),
  conventionId: z.string().uuid(),
});

/**
 * L02 — Conventions Extractor. `:id` is the repo.
 *   GET   /repos/:id/conventions                     → latest scan + all candidates
 *   POST  /repos/:id/conventions/extract             → sample → LLM → evidence gate → persist (rate-limited)
 *   PATCH /repos/:id/conventions/:conventionId       → accept / reject / edit rule or category
 *   POST  /repos/:id/conventions/status              → bulk accept / reset / reject
 *   POST  /repos/:id/conventions/skill/draft         → accepted ids → editable skill draft (stores nothing)
 *   POST  /repos/:id/conventions/skill               → save the draft as a skill (+ link agents)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams }, config: { rateLimit: EXTRACT_RATE_LIMIT } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.patch(workspaceId, req.params.id, req.params.conventionId, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/status',
    { schema: { params: IdParams, body: ConventionBulkStatus } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setStatus(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/repos/:id/conventions/skill/draft',
    { schema: { params: IdParams, body: ConventionSkillDraftRequest } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.draftSkill(workspaceId, req.params.id, req.body.convention_ids);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: ConventionSkillCreate } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return created;
    },
  );
}
