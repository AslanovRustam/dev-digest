import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Review module constants.
 */

/**
 * Studio review strategy. 'single-pass' = send the WHOLE diff in ONE LLM call.
 * We deliberately do NOT use 'auto'/map-reduce by default: map-reduce makes one
 * call PER FILE, which is slow and fragile (any single file's transient 5xx
 * fails the entire run) and unnecessary — the whole diff already fits the
 * model's context.
 */
export const REVIEW_STRATEGY = 'single-pass' as const;

/** Display order of Smart Diff groups. */
export const SMART_DIFF_ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
];

/** Role of a path that matches no rule. */
export const SMART_DIFF_DEFAULT_ROLE = 'core' as const satisfies SmartDiffRole;

/**
 * Smart Diff classifier rules. FIRST MATCH WINS, so the order below is part of
 * the contract: boilerplate -> tests -> wiring -> docs (anything else is `core`).
 *
 * Anchoring convention: a glob with `/` that does not start with `**\/` is
 * root-anchored (`dist/**`, `e2e/**`, `docs/**`, `.github/**`, `.claude/**`); a
 * bare basename glob matches at any depth. `glob` is the human label from the
 * spec, `re` the compiled equivalent run against the normalised path.
 *
 * L08 reuses this classifier as a pre-prompt filter, so keep it free of I/O.
 */
export const SMART_DIFF_RULES: readonly {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: readonly { glob: string; re: RegExp }[];
}[] = [
  {
    role: 'boilerplate',
    patterns: [
      { glob: '*.lock', re: /\.lock$/ },
      { glob: 'pnpm-lock.yaml', re: /(^|\/)pnpm-lock\.yaml$/ },
      { glob: 'package-lock.json', re: /(^|\/)package-lock\.json$/ },
      { glob: 'yarn.lock', re: /(^|\/)yarn\.lock$/ },
      { glob: 'dist/**', re: /^dist\// },
      { glob: 'build/**', re: /^build\// },
      { glob: '**/__snapshots__/**', re: /(^|\/)__snapshots__\// },
      { glob: '*.snap', re: /\.snap$/ },
      { glob: '*.generated.*', re: /(^|\/)[^/]+\.generated\.[^/]+$/ },
      { glob: '*.min.js', re: /\.min\.js$/ },
    ],
  },
  {
    role: 'tests',
    patterns: [
      // Spec lists only .ts(x); widened to JS flavours (.js/.jsx/.mjs/.cjs) because
      // this repo's own tests include `*.test.mjs` (hooks, scripts) — decision 2026-10-09.
      { glob: '**/*.test.{ts,tsx,js,jsx,mjs,cjs}', re: /\.test\.[cm]?[jt]sx?$/ },
      { glob: '**/*.it.test.ts', re: /\.it\.test\.ts$/ },
      { glob: '**/*.spec.{ts,tsx,js,jsx,mjs,cjs}', re: /\.spec\.[cm]?[jt]sx?$/ },
      { glob: '**/test/**', re: /(^|\/)test\// },
      { glob: '**/tests/**', re: /(^|\/)tests\// },
      { glob: '**/__tests__/**', re: /(^|\/)__tests__\// },
      { glob: 'e2e/**', re: /^e2e\// },
    ],
  },
  {
    role: 'wiring',
    patterns: [
      { glob: 'index.ts / index.js', re: /(^|\/)index\.(ts|js)$/ },
      { glob: '*.config.*', re: /(^|\/)[^/]+\.config\.[^/]+$/ },
      { glob: 'tsconfig*.json', re: /(^|\/)tsconfig[^/]*\.json$/ },
      { glob: '.eslintrc*', re: /(^|\/)\.eslintrc[^/]*$/ },
      { glob: '.env*', re: /(^|\/)\.env[^/]*$/ },
      { glob: 'docker-compose*.yml', re: /(^|\/)docker-compose[^/]*\.yml$/ },
      { glob: '.github/**', re: /^\.github\// },
      { glob: '.claude/**', re: /^\.claude\// },
    ],
  },
  {
    role: 'docs',
    patterns: [
      { glob: '**/*.md', re: /\.md$/i },
      { glob: 'docs/**', re: /^docs\// },
      { glob: 'README*', re: /(^|\/)README[^/]*$/i },
      { glob: 'CHANGELOG*', re: /(^|\/)CHANGELOG[^/]*$/i },
      { glob: 'LICENSE', re: /(^|\/)LICENSE$/ },
    ],
  },
];
