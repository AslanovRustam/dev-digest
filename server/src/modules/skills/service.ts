import type {
  Skill,
  SkillCreate,
  SkillImportIgnoredFile,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsRepository, type UpdateSkill } from './repository.js';
import {
  IMPORT_ARCHIVE_LIMITS,
  INITIAL_VERSION_NOTE,
  MAX_IMPORT_FILE_BYTES,
  STATS_WINDOW_DAYS,
} from './constants.js';
import {
  autoVersionNote,
  baseName,
  fallbackNameFor,
  findSkillEntry,
  ignoredReasonFor,
  importKindOf,
  isMarkdownPath,
  isSkillContentChange,
  parseSkillMarkdown,
  ratio,
  restorePatch,
  toSkillDto,
  toSkillVersionDto,
  type ParsedSkill,
  type SkillContentPatch,
} from './helpers.js';

/**
 * Skills service — CRUD with content versioning, restore, correlational stats,
 * and the import preview (parse only; nothing is stored until POST /skills).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const since = windowStart();
    const [rows, agentCounts, runs, findings] = await Promise.all([
      this.repo.list(workspaceId),
      this.repo.agentCounts(workspaceId),
      this.repo.runCounts(workspaceId, since),
      this.repo.findingCounts(workspaceId, since),
    ]);
    const runsBy = new Map(runs.map((r) => [r.skillId, r]));
    const findingsBy = new Map(findings.map((f) => [f.skillId, f]));
    return rows.map((row) => {
      const r = runsBy.get(row.id);
      const f = findingsBy.get(row.id);
      return toSkillDto(row, {
        agent_count: agentCounts.get(row.id) ?? 0,
        pull_rate: r ? ratio(r.pulled, r.total) : null,
        accept_rate: f ? ratio(f.accepted, f.accepted + f.dismissed) : null,
      });
    });
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    const row = await this.requireSkill(workspaceId, id);
    const since = windowStart();
    const [agentCounts, [r], [f]] = await Promise.all([
      this.repo.agentCounts(workspaceId, id),
      this.repo.runCounts(workspaceId, since, id),
      this.repo.findingCounts(workspaceId, since, id),
    ]);
    return toSkillDto(row, {
      agent_count: agentCounts.get(id) ?? 0,
      pull_rate: r ? ratio(r.pulled, r.total) : null,
      accept_rate: f ? ratio(f.accepted, f.accepted + f.dismissed) : null,
    });
  }

  /** Create a skill and its v1 snapshot. Imported files start disabled. */
  async create(workspaceId: string, input: SkillCreate): Promise<Skill> {
    const source = input.source ?? 'manual';
    const row = await this.repo.insert(
      {
        workspaceId,
        name: input.name,
        description: input.description,
        type: input.type,
        source,
        body: input.body,
        enabled: input.enabled ?? source !== 'imported_file',
      },
      input.note?.trim() || INITIAL_VERSION_NOTE,
    );
    return toSkillDto(row, { agent_count: 0, pull_rate: null, accept_rate: null });
  }

  /**
   * Update a skill. A content change bumps the version and snapshots it with
   * the note (or an automatic one); toggling `enabled` alone does not.
   */
  async update(workspaceId: string, id: string, patch: SkillUpdate): Promise<Skill> {
    const existing = await this.requireSkill(workspaceId, id);
    const content: SkillContentPatch = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
    };
    const note = isSkillContentChange(existing, content)
      ? patch.note?.trim() || autoVersionNote(existing, content)
      : null;
    return this.applyUpdate(workspaceId, id, {
      ...(note !== null ? content : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    }, note);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const ok = await this.repo.deleteById(workspaceId, id);
    if (!ok) throw new NotFoundError('Skill not found');
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.requireSkill(workspaceId, id);
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /**
   * Restore vK as a NEW version with vK's content and the note "Restored vK".
   * History is never rewritten; restoring content identical to the current
   * skill is a no-op.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const existing = await this.requireSkill(workspaceId, id);
    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new NotFoundError('Skill version not found');
    const patch = restorePatch(snapshot);
    if (!isSkillContentChange(existing, patch)) return this.get(workspaceId, id);
    return this.applyUpdate(workspaceId, id, patch, `Restored v${version}`);
  }

  /** Correlational usage stats over the trailing STATS_WINDOW_DAYS. */
  async stats(workspaceId: string, id: string): Promise<SkillStats> {
    await this.requireSkill(workspaceId, id);
    const since = windowStart();
    const [agents, [r], [f], byCategory] = await Promise.all([
      this.repo.linkingAgents(workspaceId, id),
      this.repo.runCounts(workspaceId, since, id),
      this.repo.findingCounts(workspaceId, since, id),
      this.repo.findingCategories(workspaceId, since, id),
    ]);
    const runsTotal = r?.total ?? 0;
    const runsPulled = r?.pulled ?? 0;
    const accepted = f?.accepted ?? 0;
    const dismissed = f?.dismissed ?? 0;
    return {
      skill_id: id,
      window_days: STATS_WINDOW_DAYS,
      used_by: agents.length,
      runs_total: runsTotal,
      runs_pulled: runsPulled,
      pull_rate: ratio(runsPulled, runsTotal),
      findings: f?.findings ?? 0,
      accepted,
      dismissed,
      accept_rate: ratio(accepted, accepted + dismissed),
      by_category: byCategory,
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        agent_enabled: a.agentEnabled,
        link_enabled: a.linkEnabled,
      })),
    };
  }

  /**
   * Parse an uploaded .md or .zip into a skill preview. Stores nothing, writes
   * nothing to disk, and decodes only markdown — every other archive file is
   * listed with the reason it was not processed.
   */
  previewImport(req: SkillImportRequest): SkillImportPreview {
    const kind = importKindOf(req.filename);
    if (!kind) throw new ValidationError('Unsupported file type — use .md or .zip');
    // Reject an oversized payload before decoding it (base64 is 4 chars per 3 bytes).
    if (req.content_base64.length > Math.ceil(MAX_IMPORT_FILE_BYTES / 3) * 4 + 4) {
      throw new ValidationError(tooLargeMessage());
    }
    const buf = Buffer.from(req.content_base64, 'base64');
    if (buf.length === 0) throw new ValidationError('The file is empty');
    if (buf.length > MAX_IMPORT_FILE_BYTES) throw new ValidationError(tooLargeMessage());

    if (kind === 'markdown') {
      const parsed = parseSkillMarkdown(buf.toString('utf8'), baseName(req.filename));
      return toPreview(parsed, req.filename, []);
    }

    const entries = this.readArchive(buf);
    const entryPath = findSkillEntry(entries.map((e) => e.path));
    if (!entryPath) throw new ValidationError('No SKILL.md found in the archive');
    const entry = entries.find((e) => e.path === entryPath)!;
    if (entry.text === undefined) {
      throw new ValidationError(
        `${entryPath} is larger than ${IMPORT_ARCHIVE_LIMITS.maxEntryBytes / 1024} KB`,
      );
    }
    const ignored: SkillImportIgnoredFile[] = entries
      .filter((e) => e.path !== entryPath)
      .map((e) => ({
        path: e.path,
        reason: ignoredReasonFor(e.path, e.size, IMPORT_ARCHIVE_LIMITS.maxEntryBytes),
      }));
    const parsed = parseSkillMarkdown(entry.text, fallbackNameFor(entryPath, req.filename));
    return toPreview(parsed, entryPath, ignored);
  }

  // ---- internals ----------------------------------------------------------

  private async requireSkill(workspaceId: string, id: string) {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return row;
  }

  private async applyUpdate(
    workspaceId: string,
    id: string,
    patch: UpdateSkill,
    note: string | null,
  ): Promise<Skill> {
    if (Object.keys(patch).length > 0) {
      const row = await this.repo.update(workspaceId, id, patch, note);
      if (!row) throw new NotFoundError('Skill not found');
    }
    return this.get(workspaceId, id);
  }

  /**
   * Read the archive in memory. The adapter's `ArchiveError` (malformed zip,
   * limits exceeded) is matched by name — the service does not import the
   * adapter — and surfaces as a 422.
   */
  private readArchive(buf: Buffer) {
    try {
      return this.container.archive.readZip(buf, IMPORT_ARCHIVE_LIMITS, isMarkdownPath);
    } catch (err) {
      if (err instanceof Error && err.name === 'ArchiveError') {
        throw new ValidationError(err.message);
      }
      throw err;
    }
  }
}

function windowStart(): Date {
  return new Date(Date.now() - STATS_WINDOW_DAYS * DAY_MS);
}

function tooLargeMessage(): string {
  return `The file is larger than ${MAX_IMPORT_FILE_BYTES / 1024} KB`;
}

function toPreview(
  parsed: ParsedSkill,
  sourceFile: string,
  ignored: SkillImportIgnoredFile[],
): SkillImportPreview {
  if (!parsed.body.trim()) throw new ValidationError('The skill body is empty');
  return {
    name: parsed.name,
    description: parsed.description,
    type: parsed.type,
    body: parsed.body,
    source_file: sourceFile,
    ignored_files: ignored,
    warnings: parsed.warnings,
  };
}
