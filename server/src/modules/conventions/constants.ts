/**
 * Conventions Extractor tunables. Sampling is code-only and bounded so one scan
 * is one cheap structured call with a predictable prompt size.
 */

/** Top-ranked source files sent to the model (`repoIntel.getConventionSamples`). */
export const SAMPLE_FILE_COUNT = 12;

/**
 * Config files that state conventions explicitly. Looked up at the repo root
 * and at the top-level directory of every sampled file, so a multi-package
 * repo (`server/tsconfig.json`, `client/eslint.config.mjs`) is covered too.
 */
export const CONFIG_FILE_NAMES = [
  '.editorconfig',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  'prettier.config.js',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.ts',
  'biome.json',
  'tsconfig.json',
] as const;

/** Most config files kept per scan (first found wins, root first). */
export const MAX_CONFIG_FILES = 6;

/** Per-file caps for the prompt; the gate still reads the FULL file. */
export const MAX_SOURCE_LINES = 220;
export const MAX_SOURCE_CHARS = 9_000;
export const MAX_CONFIG_CHARS = 3_000;

/** Upper bound on proposals the model is asked for. */
export const MAX_CANDIDATES = 15;

/** A snippet shorter than this (after whitespace collapse) proves nothing — `}` matches everywhere. */
export const MIN_SNIPPET_CHARS = 12;

/** Evidence longer than this is not a pointed example; the candidate is dropped. */
export const MAX_SNIPPET_LINES = 25;

export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
export const EXTRACTION_TIMEOUT_MS = 120_000;

export const SYSTEM_PROMPT_FILE = 'conventions.system.md';

/** Rate limit for POST …/conventions/extract (each call is a paid LLM request). */
export const EXTRACT_RATE_LIMIT = { max: 6, timeWindow: '1 minute' } as const;

/** Fenced-code language by file extension, for the generated skill body. */
export const FENCE_LANG: Record<string, string> = {
  ts: 'ts',
  tsx: 'tsx',
  js: 'js',
  jsx: 'jsx',
  mjs: 'js',
  cjs: 'js',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  json: 'json',
  css: 'css',
  sql: 'sql',
  md: 'md',
};
