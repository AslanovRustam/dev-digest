import type {
  ConventionBulkStatus,
  ConventionPatch,
  ConventionSkillCreate,
  ConventionSkillCreated,
  ConventionSkillDraft,
  ConventionsList,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { ConventionsRepository, type ConventionRow } from './repository.js';
import type { RepoRow } from '../../db/rows.js';
import {
  EXTRACTION_SCHEMA_NAME,
  EXTRACTION_TIMEOUT_MS,
  MAX_CANDIDATES,
  MAX_CONFIG_CHARS,
  MAX_CONFIG_FILES,
  MAX_SOURCE_CHARS,
  MAX_SOURCE_LINES,
  SAMPLE_FILE_COUNT,
  SYSTEM_PROMPT_FILE,
} from './constants.js';
import {
  ConventionExtraction,
  buildExtractionMessages,
  buildSkillDraft,
  configCandidatesFor,
  groundCandidates,
  knownConventions,
  normaliseRepoPath,
  toConventionDto,
  toScanDto,
  truncateForPrompt,
  type SampleFile,
} from './helpers.js';

/**
 * Conventions Extractor (L02).
 *
 *   SAMPLE (code)  config files + top-ranked source files from the clone
 *   PROPOSE (LLM)  one cheap structured call → candidate rules with evidence
 *   VERIFY (code)  the evidence gate: file exists, snippet really is in it
 *   TRIAGE (human) accept / reject / edit
 *   SKILL          accepted candidates → one skill, optionally linked to agents
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  async list(workspaceId: string, repoId: string): Promise<ConventionsList> {
    await this.requireRepo(workspaceId, repoId);
    const [scan, rows] = await Promise.all([
      this.repo.latestScan(workspaceId, repoId),
      this.repo.list(workspaceId, repoId),
    ]);
    return {
      scan: scan ? toScanDto(scan) : null,
      candidates: rows.map((r) => toConventionDto(r.row, r.skillName, r.sourceSha)),
    };
  }

  async extract(workspaceId: string, repoId: string): Promise<ConventionsList> {
    const repo = await this.requireRepo(workspaceId, repoId);
    if (!repo.clonePath) {
      throw new AppError('repo_not_cloned', 'The repository is not cloned yet — wait for the clone to finish.', 409);
    }
    const ref = { owner: repo.owner, name: repo.name };

    // 1. SAMPLE — code only, no model.
    const samplePaths = await this.container.repoIntel.getConventionSamples(repo.id, SAMPLE_FILE_COUNT);
    if (samplePaths.length === 0) {
      throw new AppError(
        'repo_not_indexed',
        'No files to sample — the repository is not indexed yet (or repo-intel is disabled).',
        409,
      );
    }
    const fileCache = new Map<string, string | null>();
    const read = async (path: string): Promise<string | null> => {
      if (fileCache.has(path)) return fileCache.get(path)!;
      // Missing or empty → null: an empty file is neither a sample nor evidence.
      const content = (await this.container.git.readFile(ref, path).catch(() => null)) || null;
      fileCache.set(path, content);
      return content;
    };

    const sources: SampleFile[] = [];
    for (const path of samplePaths) {
      const content = await read(path);
      if (content === null) continue;
      const { text, truncated } = truncateForPrompt(content, MAX_SOURCE_LINES, MAX_SOURCE_CHARS);
      sources.push({ path, content: text, truncated });
    }
    if (sources.length === 0) {
      throw new AppError('repo_not_readable', 'The sampled files could not be read from the clone.', 409);
    }
    const configs: SampleFile[] = [];
    for (const path of configCandidatesFor(samplePaths)) {
      if (configs.length >= MAX_CONFIG_FILES) break;
      const content = await read(path);
      if (content === null) continue;
      const { text, truncated } = truncateForPrompt(content, Number.MAX_SAFE_INTEGER, MAX_CONFIG_CHARS);
      configs.push({ path, content: text, truncated });
    }
    const sourceSha = await this.container.git.currentHead(ref);
    const triaged = await this.repo.listTriaged(workspaceId, repoId);

    // 2. PROPOSE — one structured call on the workspace's conventions model.
    const { provider, model } = await this.container.featureModel(workspaceId, 'conventions');
    const llm = await this.container.llm(provider);
    const system = await renderPrompt(SYSTEM_PROMPT_FILE, { max: String(MAX_CANDIDATES) });
    const result = await llm.completeStructured({
      model,
      schema: ConventionExtraction,
      schemaName: EXTRACTION_SCHEMA_NAME,
      messages: buildExtractionMessages({
        system,
        repoFullName: repo.fullName,
        configs,
        sources,
        rejectedRules: triaged.filter((c) => c.status === 'rejected').map((c) => c.rule),
        acceptedRules: triaged.filter((c) => c.status === 'accepted').map((c) => c.rule),
      }),
      temperature: 0,
      timeoutMs: EXTRACTION_TIMEOUT_MS,
    });
    const proposals = result.data.candidates.slice(0, MAX_CANDIDATES);

    // 3. VERIFY — the evidence gate reads every cited file in FULL from the clone.
    const files = new Map<string, string | null>();
    for (const c of proposals) {
      const path = normaliseRepoPath(c.evidence_path);
      if (path && !files.has(path)) files.set(path, await read(path));
    }
    const outcome = groundCandidates(proposals, files, knownConventions(triaged));

    await this.repo.replacePending(
      {
        workspaceId,
        repoId,
        sourceSha,
        sampleFiles: [...configs, ...sources].map((f) => f.path),
        model: result.model || model,
        proposed: proposals.length,
        droppedUngrounded: outcome.droppedUngrounded,
        droppedDuplicate: outcome.droppedDuplicate,
        costUsd: result.costUsd ?? null,
      },
      outcome.kept,
    );
    return this.list(workspaceId, repoId);
  }

  async patch(
    workspaceId: string,
    repoId: string,
    id: string,
    patch: ConventionPatch,
  ): Promise<ConventionsList> {
    const row = await this.repo.update(workspaceId, repoId, id, patch);
    if (!row) throw new NotFoundError('Convention not found');
    return this.list(workspaceId, repoId);
  }

  async setStatus(
    workspaceId: string,
    repoId: string,
    input: ConventionBulkStatus,
  ): Promise<ConventionsList> {
    await this.requireRepo(workspaceId, repoId);
    await this.repo.setStatus(workspaceId, repoId, input.ids, input.status);
    return this.list(workspaceId, repoId);
  }

  /** Build an editable skill draft from accepted candidates. Stores nothing. */
  async draftSkill(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.requireAccepted(workspaceId, repoId, ids);
    return buildSkillDraft(repo.name, rows);
  }

  /**
   * Save the (edited) draft as a skill. The server re-checks that every
   * candidate is accepted — a rejected rule can never reach a skill, whatever
   * the client sends. Optionally links the new skill to agents.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: ConventionSkillCreate,
  ): Promise<ConventionSkillCreated> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const rows = await this.requireAccepted(workspaceId, repoId, input.convention_ids);
    const agentIds = [...new Set(input.agent_ids)];
    for (const agentId of agentIds) {
      const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) throw new ValidationError(`Agent ${agentId} not found`);
    }

    const draft = buildSkillDraft(repo.name, rows);
    const skill = await this.container.skillsRepo.insert(
      {
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source: 'extracted',
        body: input.body,
        enabled: input.enabled,
        evidenceFiles: draft.evidence_files,
      },
      `Extracted from ${rows.length} convention${rows.length === 1 ? '' : 's'} in ${repo.fullName}`,
    );
    await this.repo.markInSkill(workspaceId, rows.map((r) => r.id), skill.id);

    for (const agentId of agentIds) {
      const linked = await this.container.agentsRepo.linkedSkills(agentId);
      await this.container.agentsRepo.linkSkill(agentId, skill.id, linked.length);
    }
    return {
      skill_id: skill.id,
      name: skill.name,
      version: skill.version,
      convention_ids: rows.map((r) => r.id),
      linked_agent_ids: agentIds,
    };
  }

  // ---- internals ----------------------------------------------------------

  private async requireRepo(workspaceId: string, repoId: string): Promise<RepoRow> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  /** Load the candidates in the caller's order; every one must exist and be accepted. */
  private async requireAccepted(
    workspaceId: string,
    repoId: string,
    ids: string[],
  ): Promise<ConventionRow[]> {
    const unique = [...new Set(ids)];
    const rows = await this.repo.getByIds(workspaceId, repoId, unique);
    if (rows.length !== unique.length) throw new NotFoundError('Convention not found');
    const notAccepted = rows.filter((r) => r.status !== 'accepted');
    if (notAccepted.length > 0) {
      throw new ValidationError(
        `Only accepted conventions can go into a skill — ${notAccepted.length} of the selected are ${[
          ...new Set(notAccepted.map((r) => r.status)),
        ].join(' / ')}.`,
        { ids: notAccepted.map((r) => r.id) },
      );
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    return unique.map((id) => byId.get(id)!);
  }
}
