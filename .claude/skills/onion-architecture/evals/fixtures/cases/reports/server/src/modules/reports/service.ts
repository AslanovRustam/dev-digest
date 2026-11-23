import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { countBlockers } from '../../../../reviewer-core/src/review/blockers.js';
import { requireRepoById } from '../_shared/report-access.js';
import { ReportRepository } from './repository.js';
import { scoreFindings } from './scoring.js';
import { renderMarkdown, renderJson } from './format.js';
import { clampNote, verdictFor } from './helpers.js';
import { LIST_LIMIT, type ComposeBody } from './constants.js';
import type { ComposedReport, ExportFormat, ReportDto, ReportInput } from './types.js';

/**
 * Reports service — compose, list, export and remove the review report of a pull request.
 */
export class ReportService {
  private reports: ReportRepository;

  constructor(private container: Container) {
    this.reports = new ReportRepository(container.db);
  }

  async list(workspaceId: string, prId: string): Promise<ReportDto[]> {
    return this.reports.listForPull(workspaceId, prId, LIST_LIMIT);
  }

  async compose(workspaceId: string, prId: string, input: ComposeBody): Promise<ComposedReport> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const repo = await requireRepoById(this.container, workspaceId, pull.repoId);
    const findings = await this.container.reviewRepo.findingsForPull(workspaceId, prId);
    const files = parseUnifiedDiff(pull.diff ?? '').files.length;

    const reportInput: ReportInput = {
      repo: repo.full_name,
      prNumber: pull.number,
      title: `${pull.title} (${files} files)`,
      score: scoreFindings(findings),
      blockers: countBlockers(findings),
      findings,
      note: clampNote(input.note),
    };

    await this.reports.deleteForPull(prId);
    const row = await this.reports.insert({
      prId,
      body: renderMarkdown(reportInput),
      verdict: verdictFor(findings),
    });

    return {
      id: row.id,
      pr_id: row.prId,
      body: row.body,
      verdict: row.verdict,
      posted_at: null,
      github_review_id: null,
      owner: repo.owner,
      repo: repo.name,
      pr_number: pull.number,
    };
  }

  async exportReport(id: string, format: ExportFormat): Promise<{ filename: string; content: string }> {
    const row = await this.reports.getById(id);
    if (!row) throw new NotFoundError('Report not found');
    if (format === 'json') {
      return { filename: `report-${id}.json`, content: renderJson(await this.inputFor(row.prId)) };
    }
    return { filename: `report-${id}.md`, content: row.body };
  }

  async remove(id: string): Promise<void> {
    const removed = await this.reports.remove(id);
    if (!removed) throw new NotFoundError('Report not found');
  }

  private async inputFor(prId: string): Promise<ReportInput> {
    const pull = await this.container.reviewRepo.getPullById(prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const findings = await this.container.reviewRepo.findingsForPullById(prId);
    return {
      repo: String(pull.repoId),
      prNumber: pull.number,
      title: pull.title,
      score: scoreFindings(findings),
      blockers: countBlockers(findings),
      findings,
    };
  }
}
