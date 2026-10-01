import { z } from 'zod';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

export const EvalRun = z.object({
  recall: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  citation_accuracy: z.number().min(0).max(1),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z.object({
  id: z.string(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string(),
  input_diff: z.string(),
  input_files: z.unknown(),
  input_meta: z.unknown(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'imported_file', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
  // How many agents link this skill (any per-agent state). Present on list/get.
  agent_count: z.number().int().nullish(),
  // 30-day correlational stats (see SkillStats); null = no data. List/get only.
  pull_rate: z.number().nullish(),
  accept_rate: z.number().nullish(),
});
export type Skill = z.infer<typeof Skill>;

// Skill input contracts (the /skills CRUD). The description is the skill's
// interface: the agent reads it to decide when the rules apply — phrase it
// directively ("Flag …", "Use when …").
export const SkillCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  type: SkillType,
  body: z.string().min(1).max(50_000),
  enabled: z.boolean().optional(),
  source: SkillSource.optional(),
  /** Change note for v1; empty → "Initial version". */
  note: z.string().max(200).optional(),
});
export type SkillCreate = z.infer<typeof SkillCreate>;

export const SkillUpdate = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(50_000).optional(),
  enabled: z.boolean().optional(),
  /** "What changed?" — stored on the new version; empty → an automatic note. */
  note: z.string().max(200).optional(),
});
export type SkillUpdate = z.infer<typeof SkillUpdate>;

/**
 * One immutable content snapshot from `skill_versions`. name/description/type
 * are null on snapshots taken before they were recorded.
 */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  note: z.string(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  type: SkillType.nullish(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/**
 * GET /skills/:id/stats — correlational, over a trailing window. "Pulled" runs
 * are completed runs of the linking agents whose trace carries this skill in
 * prompt_assembly.skill_blocks; findings/accept rate come from those runs'
 * reviews. Rates are 0..1, null when the denominator is 0.
 */
export const SkillStats = z.object({
  skill_id: z.string(),
  window_days: z.number().int(),
  used_by: z.number().int(),
  runs_total: z.number().int(),
  runs_pulled: z.number().int(),
  pull_rate: z.number().nullable(),
  findings: z.number().int(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  accept_rate: z.number().nullable(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      agent_enabled: z.boolean(),
      link_enabled: z.boolean(),
    }),
  ),
});
export type SkillStats = z.infer<typeof SkillStats>;

// Import = parse only. The server extracts the skill core (SKILL.md) from a
// markdown file or a .zip archive and returns a preview; nothing is persisted
// until the user confirms via POST /skills. Archive files other than the skill
// markdown are listed, never executed or written to disk.
export const SkillImportRequest = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1),
});
export type SkillImportRequest = z.infer<typeof SkillImportRequest>;

export const SkillImportIgnoredFile = z.object({
  path: z.string(),
  reason: z.enum(['executable', 'non_markdown', 'extra_markdown', 'too_large']),
});
export type SkillImportIgnoredFile = z.infer<typeof SkillImportIgnoredFile>;

export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source_file: z.string(),
  ignored_files: z.array(SkillImportIgnoredFile),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;

export const CommunitySkill = z.object({
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

// ---- Conventions ----
// Conventions Extractor (L02): code samples a repo, a cheap model proposes
// rules with evidence, a code gate keeps only rules whose evidence is real
// code in the clone, and a human triages them into skills.
export const ConventionCategory = z.enum([
  'naming',
  'async',
  'error-handling',
  'imports',
  'architecture',
  'typing',
  'testing',
  'style',
  'api',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const ConventionCandidate = z.object({
  id: z.string(),
  repo_id: z.string(),
  scan_id: z.string().nullable(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  /** 1-based, inclusive; computed by the server from the verified snippet. */
  evidence_start_line: z.number().int(),
  evidence_end_line: z.number().int(),
  /** Re-read from the file, never the model's text. */
  evidence_snippet: z.string(),
  confidence: z.number().min(0).max(1),
  status: ConventionStatus,
  /** Set once the candidate was merged into a skill. */
  skill_id: z.string().nullable(),
  skill_name: z.string().nullable(),
  created_at: z.string(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

/** One extraction run; `source_sha` pins the GitHub evidence links. */
export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  source_sha: z.string(),
  sample_files: z.array(z.string()),
  model: z.string(),
  proposed: z.number().int(),
  dropped_ungrounded: z.number().int(),
  dropped_duplicate: z.number().int(),
  cost_usd: z.number().nullable(),
  created_at: z.string(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

/** GET /repos/:id/conventions and the POST …/extract response. */
export const ConventionsList = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

/** PATCH /repos/:id/conventions/:conventionId — triage or edit. Evidence is not editable. */
export const ConventionPatch = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().trim().min(3).max(500).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'Nothing to update' });
export type ConventionPatch = z.infer<typeof ConventionPatch>;

/** POST /repos/:id/conventions/status — bulk triage ("Accept all" / "Deselect all"). */
export const ConventionBulkStatus = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  status: ConventionStatus,
});
export type ConventionBulkStatus = z.infer<typeof ConventionBulkStatus>;

/** POST /repos/:id/conventions/skill/draft — accepted ids → editable skill draft. */
export const ConventionSkillDraftRequest = z.object({
  convention_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type ConventionSkillDraftRequest = z.infer<typeof ConventionSkillDraftRequest>;

export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  evidence_files: z.array(z.string()),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/**
 * POST /repos/:id/conventions/skill — save the (edited) draft as a skill.
 * Every id must be `accepted`; rejected or pending ones are refused (422).
 */
export const ConventionSkillCreate = z.object({
  convention_ids: z.array(z.string().uuid()).min(1).max(100),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(1000).default(''),
  type: SkillType.default('convention'),
  body: z.string().min(1).max(50_000),
  enabled: z.boolean().default(true),
  /** Agents to link the new skill to (appended, enabled). */
  agent_ids: z.array(z.string().uuid()).max(20).default([]),
});
export type ConventionSkillCreate = z.infer<typeof ConventionSkillCreate>;

export const ConventionSkillCreated = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.number().int(),
  convention_ids: z.array(z.string()),
  linked_agent_ids: z.array(z.string()),
});
export type ConventionSkillCreated = z.infer<typeof ConventionSkillCreated>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
  // Skills that would reach this agent's prompt (link enabled AND skill enabled).
  skill_count: z.number().int().nullish(),
});
export type Agent = z.infer<typeof Agent>;

// `enabled` is per agent: a disabled link keeps its position in the order but
// is left out of the prompt. The skill's own `enabled` is a global kill switch.
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

/** PUT /agents/:id/skills — the full ordered set; order = array index. */
export const AgentSkillsSet = z.object({
  items: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() })).max(200),
});
export type AgentSkillsSet = z.infer<typeof AgentSkillsSet>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
