import type {
  Skill,
  SkillImportIgnoredFile,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { SkillType as SkillTypeSchema } from '@devdigest/shared';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import {
  ARCHIVE_EXTENSIONS,
  CAPABILITY_FRONTMATTER_KEYS,
  EXECUTABLE_EXTENSIONS,
  EXECUTABLE_FOLDERS,
  MARKDOWN_EXTENSIONS,
  SKILL_ENTRY_FILE,
} from './constants.js';

/**
 * Pure helpers for the skills module — row ⇄ DTO mapping, the version-bump
 * rule, the prompt block format, and the importer's parsing/classification.
 * No I/O.
 */

/** List/get extras computed from links and the stats window. */
export interface SkillUsage {
  agent_count: number;
  pull_rate: number | null;
  accept_rate: number | null;
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow, usage?: SkillUsage): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
    ...(usage ?? {}),
  };
}

/** `part / whole`, or null when there is nothing to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/**
 * The update that restores a version: its body, plus name/description/type
 * where the snapshot recorded them (older snapshots carry the body only).
 */
export function restorePatch(
  version: Pick<SkillVersionRow, 'body' | 'name' | 'description' | 'type'>,
): SkillContentPatch {
  return {
    body: version.body,
    ...(version.name != null ? { name: version.name } : {}),
    ...(version.description != null ? { description: version.description } : {}),
    ...(version.type != null ? { type: version.type as SkillType } : {}),
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    note: row.note,
    name: row.name ?? null,
    description: row.description ?? null,
    type: (row.type as SkillType | null) ?? null,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/** Fields whose change bumps the skill's version (anything but `enabled`). */
export interface SkillContentPatch {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
}

/** True when a patch changes the skill's content (vs. just toggling `enabled`). */
export function isSkillContentChange(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillContentPatch,
): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.type !== undefined && patch.type !== existing.type) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/**
 * The note stored on a new version when the user left "What changed?" empty,
 * e.g. "Edited body, description". Field order is fixed for stable output.
 */
export function autoVersionNote(
  existing: Pick<SkillRow, 'name' | 'description' | 'type' | 'body'>,
  patch: SkillContentPatch,
): string {
  const changed = (['body', 'name', 'description', 'type'] as const).filter(
    (k) => patch[k] !== undefined && patch[k] !== existing[k],
  );
  return changed.length > 0 ? `Edited ${changed.join(', ')}` : 'Edited';
}

// ---- Import -----------------------------------------------------------------

export type ImportKind = 'markdown' | 'zip';

function extOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot).toLowerCase();
}

/** File name without folders or extension: `a/b/flaky.md` → `flaky`. */
export function baseName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? base : base.slice(0, dot);
}

/** Which importer a filename selects, or null when unsupported. */
export function importKindOf(filename: string): ImportKind | null {
  const ext = extOf(filename);
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) return 'markdown';
  if ((ARCHIVE_EXTENSIONS as readonly string[]).includes(ext)) return 'zip';
  return null;
}

export function isMarkdownPath(path: string): boolean {
  return (MARKDOWN_EXTENSIONS as readonly string[]).includes(extOf(path));
}

/**
 * Locate the skill core in an archive's file list: `SKILL.md` at the root or
 * inside a single top-level folder (the usual "zip the folder" layout); failing
 * that, the only markdown file. Null when ambiguous or absent.
 */
export function findSkillEntry(paths: string[]): string | null {
  const candidates = paths.filter((p) => {
    const parts = p.split('/');
    return parts.length <= 2 && parts[parts.length - 1]!.toLowerCase() === SKILL_ENTRY_FILE;
  });
  if (candidates.length > 0) {
    return candidates.sort((a, b) => a.split('/').length - b.split('/').length)[0]!;
  }
  const md = paths.filter(isMarkdownPath);
  return md.length === 1 ? md[0]! : null;
}

/** Why a non-core archive file was left out of the import. */
export function classifyIgnoredFile(path: string): SkillImportIgnoredFile['reason'] {
  const parts = path.toLowerCase().split('/');
  const inExecFolder = parts
    .slice(0, -1)
    .some((dir) => (EXECUTABLE_FOLDERS as readonly string[]).includes(dir));
  if (inExecFolder || (EXECUTABLE_EXTENSIONS as readonly string[]).includes(extOf(path))) {
    return 'executable';
  }
  return isMarkdownPath(path) ? 'extra_markdown' : 'non_markdown';
}

/**
 * Reason for an archive file that is not the skill core: a markdown file over
 * the per-entry limit is `too_large` (it was never decoded); anything else is
 * classified by path.
 */
export function ignoredReasonFor(
  path: string,
  size: number,
  maxEntryBytes: number,
): SkillImportIgnoredFile['reason'] {
  const reason = classifyIgnoredFile(path);
  return reason === 'extra_markdown' && size > maxEntryBytes ? 'too_large' : reason;
}

/** Fallback skill name for an archive entry: its folder, else the archive name. */
export function fallbackNameFor(entryPath: string, filename: string): string {
  const parts = entryPath.split('/');
  if (parts.length > 1) return parts[parts.length - 2]!;
  return baseName(filename);
}

export interface ParsedSkill {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  warnings: string[];
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse the small YAML subset skill frontmatter uses: `key: value` scalars and
 * `key: |` / `key: >` blocks of indented lines. Anything fancier is ignored —
 * the importer only needs name / description / type.
 */
function parseFrontmatter(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!.trim();
    if (raw === '|' || raw === '>' || raw === '|-' || raw === '>-') {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1]!.trim() === '')) {
        block.push(lines[++i]!.trim());
      }
      out[key] = raw.startsWith('>') ? block.filter(Boolean).join(' ') : block.join('\n').trim();
    } else {
      out[key] = unquote(raw);
    }
  }
  return out;
}

/**
 * Extract a skill's core from markdown: frontmatter (name / description / type)
 * plus the body. Missing name → first `# heading` → `fallbackName`; unknown
 * type → `custom`. Capability keys (allowed-tools, hooks, …) are dropped with a
 * warning: a DevDigest skill is prompt text only.
 */
export function parseSkillMarkdown(text: string, fallbackName: string): ParsedSkill {
  const warnings: string[] = [];
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let fm: Record<string, string> = {};
  let body = normalized;
  const fmMatch = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalized);
  if (fmMatch) {
    fm = parseFrontmatter(fmMatch[1]!);
    body = normalized.slice(fmMatch[0].length);
  }
  body = body.trim();

  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const name = (fm.name?.trim() || heading || fallbackName).slice(0, 120);

  let type: SkillType = 'custom';
  if (fm.type !== undefined) {
    const parsed = SkillTypeSchema.safeParse(fm.type.trim().toLowerCase());
    if (parsed.success) type = parsed.data;
    else warnings.push(`Unknown type "${fm.type}" — defaulted to "custom".`);
  }

  const description = (fm.description ?? '').trim();
  if (!description) warnings.push('No description — add one that says when the agent should apply this skill.');

  const dropped = Object.keys(fm).filter((k) => (CAPABILITY_FRONTMATTER_KEYS as readonly string[]).includes(k));
  if (dropped.length > 0) {
    warnings.push(`Ignored ${dropped.join(', ')}: skills here are prompt text only, never tools or code.`);
  }

  return { name, description, type, body, warnings };
}
