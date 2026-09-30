/** Constants for the skills module. */

/** Initial body version recorded for a newly-created skill. */
export const INITIAL_SKILL_VERSION = 1;

/** Largest file the importer accepts (decoded bytes, .md or .zip). */
export const MAX_IMPORT_FILE_BYTES = 512 * 1024;

/** Zip-bomb guards for an imported archive (see adapters/archive). */
export const IMPORT_ARCHIVE_LIMITS = {
  maxEntries: 200,
  maxEntryBytes: 256 * 1024,
  maxTotalBytes: 2 * 1024 * 1024,
} as const;

/** The file that carries a skill's core inside an archive (case-insensitive). */
export const SKILL_ENTRY_FILE = 'skill.md';

export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'] as const;
export const ARCHIVE_EXTENSIONS = ['.zip'] as const;

/**
 * Anything that could run: shell/script sources and binaries. An archive may
 * carry them (e.g. a `scripts/` folder) — they are listed in the preview as
 * "not processed" and never decoded, stored or executed.
 */
export const EXECUTABLE_EXTENSIONS = [
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.exe', '.com', '.msi',
  '.js', '.mjs', '.cjs', '.ts', '.py', '.rb', '.pl', '.php', '.jar', '.bin',
  '.dll', '.so', '.dylib', '.app', '.vbs', '.scr',
] as const;

/** Top-level folders whose files are always treated as executable payload. */
export const EXECUTABLE_FOLDERS = ['scripts', 'bin', 'hooks'] as const;

/** Frontmatter keys that grant a coding agent capabilities — ignored here. */
export const CAPABILITY_FRONTMATTER_KEYS = ['allowed-tools', 'tools', 'hooks', 'mcp', 'mcpServers'] as const;

/** Trailing window (days) for skill stats — pull rate, findings, accept rate. */
export const STATS_WINDOW_DAYS = 30;

/** Note on the v1 snapshot when the creator left "What changed?" empty. */
export const INITIAL_VERSION_NOTE = 'Initial version';

/** The agent_runs status of a completed run (the only ones stats count). */
export const COMPLETED_RUN_STATUS = 'done';
