import type { Finding } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { groundFindings } from '../../../../reviewer-core/src/grounding.js';
import { EvalRepository } from './repository.js';
import { toCaseDto, computeScores, type EvalCaseDto, type ScoreResult } from './helpers.js';
import type { EvalCaseBody } from './constants.js';

/**
 * Evals service — create, replace, list and score eval cases.
 */
export class EvalService {
  private evals: EvalRepository;

  constructor(private container: Container) {
    this.evals = new EvalRepository(container.db);
  }

  async list(workspaceId: string): Promise<EvalCaseDto[]> {
    const rows = await this.evals.listCases(workspaceId);
    return rows.map(toCaseDto);
  }

  async create(workspaceId: string, input: EvalCaseBody): Promise<EvalCaseDto> {
    await this.requireOwner(workspaceId, input);
    const row = await this.evals.insertCase({
      workspaceId,
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? null,
      notes: input.notes ?? null,
    });
    return toCaseDto(row);
  }

  async replace(workspaceId: string, id: string, input: EvalCaseBody): Promise<EvalCaseDto> {
    const existing = await this.evals.getCase(workspaceId, id);
    if (!existing) throw new NotFoundError('Eval case not found');
    await this.requireOwner(workspaceId, input);

    await this.evals.deleteRunsForCase(id);
    const row = await this.evals.updateCase(workspaceId, id, {
      ownerKind: input.owner_kind,
      ownerId: input.owner_id,
      name: input.name,
      inputDiff: input.input_diff ?? null,
      notes: input.notes ?? null,
    });
    return toCaseDto(row!);
  }

  async score(workspaceId: string, id: string, findings: Finding[]): Promise<ScoreResult> {
    const row = await this.evals.getCase(workspaceId, id);
    if (!row) throw new NotFoundError('Eval case not found');

    const diff = parseUnifiedDiff(row.inputDiff ?? '');
    const grounded = groundFindings(findings, diff);
    const scores = computeScores(findings.length, grounded.kept.length, row.expectedOutput);

    await this.evals.insertRun({
      caseId: id,
      pass: scores.pass,
      recall: scores.recall,
      precision: scores.precision,
    });
    return scores;
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const removed = await this.evals.deleteCase(workspaceId, id);
    if (!removed) throw new NotFoundError('Eval case not found');
  }

  private async requireOwner(workspaceId: string, input: EvalCaseBody): Promise<void> {
    if (input.owner_kind !== 'agent') return;
    const agent = await this.container.agentsRepo.getById(workspaceId, input.owner_id);
    if (!agent) throw new NotFoundError('Agent not found');
  }
}
