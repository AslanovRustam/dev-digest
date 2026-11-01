import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ContextAttachments,
  ContextAttachmentsQuery,
  ContextAttachmentsSet,
  ContextDocList,
  ContextDocQuery,
  ContextDocument,
  ContextSaveRequest,
  ContextSaveResult,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RESCAN_RATE_LIMIT, SAVE_RATE_LIMIT } from './constants.js';

/**
 * L05 — Project Context. `:id` is the repo, or the agent / skill on the
 * attachment routes.
 *   GET  /repos/:id/context             → documents of the clone (tree, tokens, used-by)
 *   GET  /repos/:id/context/document    → one document (?path=)
 *   POST /repos/:id/context/rescan      → sync the clone, list again (rate-limited)
 *   POST /repos/:id/context/documents   → commit to a new branch + open a PR (rate-limited)
 *   GET|PUT /agents/:id/context, /skills/:id/context → ordered attached paths (?repo_id= counts them)
 * No route calls a model.
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.projectContext;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextDocList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/document',
    { schema: { params: IdParams, querystring: ContextDocQuery, response: { 200: ContextDocument } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.document(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post(
    '/repos/:id/context/rescan',
    {
      schema: { params: IdParams, response: { 200: ContextDocList } },
      config: { rateLimit: RESCAN_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.rescan(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/context/documents',
    {
      schema: { params: IdParams, body: ContextSaveRequest, response: { 201: ContextSaveResult } },
      config: { rateLimit: SAVE_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.save(workspaceId, req.params.id, req.body);
      return reply.status(201).send(result);
    },
  );

  for (const kind of ['agent', 'skill'] as const) {
    const url = kind === 'agent' ? '/agents/:id/context' : '/skills/:id/context';

    app.get(
      url,
      {
        schema: {
          params: IdParams,
          querystring: ContextAttachmentsQuery,
          response: { 200: ContextAttachments },
        },
      },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return service.getAttachments(workspaceId, { kind, id: req.params.id }, req.query.repo_id);
      },
    );

    app.put(
      url,
      {
        schema: {
          params: IdParams,
          querystring: ContextAttachmentsQuery,
          body: ContextAttachmentsSet,
          response: { 200: ContextAttachments },
        },
      },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return service.setAttachments(
          workspaceId,
          { kind, id: req.params.id },
          req.body.paths,
          req.query.repo_id,
        );
      },
    );
  }
}
