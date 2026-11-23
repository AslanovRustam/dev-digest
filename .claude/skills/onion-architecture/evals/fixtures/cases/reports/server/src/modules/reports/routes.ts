import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ReportService } from './service.js';
import { ComposeBody, ExportQuery } from './constants.js';

/**
 * Reports module — the review report of a pull request.
 *   GET    /pulls/:id/reports          → reports of a pull request
 *   POST   /pulls/:id/reports          → compose a new report (optionally post it to GitHub)
 *   GET    /reports/:id/export         → download a report (?format=md|json)
 *   DELETE /reports/:id                → remove a report
 */
export default async function reportsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ReportService(app.container);

  app.get('/pulls/:id/reports', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/reports',
    { schema: { params: IdParams, body: ComposeBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const report = await service.compose(workspaceId, req.params.id, req.body);

      if (req.body.post_to_github) {
        const github = await app.container.github();
        await github.postReview({ owner: report.owner, name: report.repo }, report.pr_number, {
          body: report.body,
          event: report.verdict === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT',
        });
      }

      reply.status(201);
      return report;
    },
  );

  app.get(
    '/reports/:id/export',
    { schema: { params: IdParams, querystring: ExportQuery } },
    async (req) => {
      await getContext(app.container, req);
      return service.exportReport(req.params.id, req.query.format);
    },
  );

  app.delete('/reports/:id', { schema: { params: IdParams } }, async (req) => {
    await getContext(app.container, req);
    await service.remove(req.params.id);
    return { deleted: req.params.id };
  });
}
