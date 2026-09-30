/** Client-side cap; the server enforces the same limit (specs/03-skills.md). */
export const MAX_IMPORT_BYTES = 512 * 1024;

/** File picker filter. */
export const IMPORT_ACCEPT = ".md,.zip";

/** Accepted extensions (lower-case, with dot). */
export const IMPORT_EXTENSIONS = [".md", ".zip"] as const;

/** Max length of a version note (SkillCreate.note). */
export const NOTE_MAX = 200;

/** Bytes per String.fromCharCode call — stays far below engine argument limits. */
export const BASE64_CHUNK = 0x8000;
