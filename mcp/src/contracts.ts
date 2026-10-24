/**
 * Ring 0: lenient local Zod shapes. Only the fields the tools read; unknown keys are
 * stripped so additive server changes never break the client. NOT a copy of
 * `@devdigest/shared` (rule MR7).
 */
import { z } from 'zod';

// ---- API responses ----

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string(),
  enabled: z.boolean(),
  description: z.string().default(''),
});
export type Agent = z.infer<typeof Agent>;
export const AgentList = z.array(Agent);

export const Repo = z.object({ id: z.uuid(), full_name: z.string() });
export type Repo = z.infer<typeof Repo>;
export const RepoList = z.array(Repo);

export const PrMeta = z.object({
  id: z.uuid().nullish(),
  number: z.number().int(),
  title: z.string(),
});
export type PrMeta = z.infer<typeof PrMeta>;
export const PrList = z.array(PrMeta);

export const ReviewRunResponse = z.object({
  runs: z.array(z.object({ run_id: z.uuid(), agent_id: z.uuid() })),
});
export type ReviewRunResponse = z.infer<typeof ReviewRunResponse>;

export const RunStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatus>;

export const Severity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  rationale: z.string(),
  suggestion: z.string().nullish(),
  confidence: z.number(),
  dismissed_at: z.string().nullish(),
});
export type Finding = z.infer<typeof Finding>;

/** GET /runs/:id/findings */
export const RunFindings = z.object({
  run_id: z.string(),
  agent_name: z.string().nullable(),
  status: RunStatus,
  error: z.string().nullable(),
  verdict: z.enum(['request_changes', 'approve', 'comment']).nullable(),
  summary: z.string().nullable(),
  score: z.number().nullable(),
  findings: z.array(Finding),
});
export type RunFindings = z.infer<typeof RunFindings>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

export const Convention = z.object({
  id: z.string(),
  category: z.string(),
  rule: z.string(),
  evidence_path: z.string(),
  evidence_start_line: z.number().int(),
  evidence_end_line: z.number().int(),
  evidence_snippet: z.string(),
  confidence: z.number(),
  status: ConventionStatus,
});
export type Convention = z.infer<typeof Convention>;

/** GET /repos/:id/conventions */
export const ConventionsList = z.object({
  scan: z.object({ created_at: z.string() }).nullable(),
  candidates: z.array(Convention),
});
export type ConventionsList = z.infer<typeof ConventionsList>;

// ---- Tool inputs (flat shapes; descriptions are LLM-facing and user-approved, plan §6a) ----

const repo = z.string().describe('GitHub repo as owner/name, e.g. acme/payments-api');
const pr = z.number().int().positive().describe('Pull request number, e.g. 482');
const cursor = z.string().optional().describe('next_cursor from the previous response');
const responseFormat = z.enum(['concise', 'detailed']).default('concise');

export const listAgentsInput = {};

export const runAgentOnPrInput = {
  repo,
  pr,
  agent: z.string().describe('Agent id from list_agents'),
};

export const getFindingsInput = {
  run_id: z.uuid().describe('Run id returned by run_agent_on_pr'),
  limit: z.number().int().min(1).max(50).default(20),
  cursor,
  response_format: responseFormat,
};

export const getConventionsInput = {
  repo,
  status: z.enum(['accepted', 'pending', 'rejected', 'all']).default('accepted'),
  limit: z.number().int().min(1).max(100).default(30),
  cursor,
  response_format: responseFormat,
};

export const getBlastRadiusInput = { repo, pr };
