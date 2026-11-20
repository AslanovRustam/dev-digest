import type { BlastRadiusResponse, PrBriefResponse, PrIntentRecord } from '@devdigest/shared';
import { PrBrief as PrBriefSchema } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { withTimeout } from '../../platform/resilience.js';
import {
  buildLlmCallLog,
  formatCallLine,
  redactSecrets,
  type LlmCallSection,
} from '../../platform/llm-call-log.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import type { BriefDocuments } from '../project-context/types.js';
import { BriefRepository } from './repository.js';
import {
  COLLECT_TIMEOUT_MS,
  GENERATION_DEADLINE_MS,
  ATTEMPT_TIMEOUT_MS,
  MAX_FOCUS,
  MAX_RETRIES,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  PrBriefAnswer,
  SCHEMA_NAME,
  SYSTEM_PROMPT_FILE,
  TRANSPORT_ATTEMPTS,
} from './constants.js';
import {
  buildBriefInput,
  checkAnswer,
  firstIssueNumber,
  newSideRanges,
  staleReasons,
  type AnswerContext,
  type BriefBlastFact,
  type BriefFacts,
  type BriefFile,
  type BriefIssueFact,
  type LineRange,
} from './helpers.js';
import type { BriefLogFn } from './types.js';

const noopLog: BriefLogFn = () => undefined;

export interface BriefServiceOptions {
  /** Whole-generation budget; tests shorten it. */
  deadlineMs?: number;
  /** Per optional input; tests shorten it. */
  collectTimeoutMs?: number;
}

/** Shared state of one generation: set when the deadline gave up on it. */
interface RunState {
  abandoned: boolean;
  /** The brief write has started: the deadline no longer gives up on the run. */
  committed: boolean;
  /** Epoch ms at which the whole-generation budget ends. */
  deadlineAt: number;
}

/**
 * PR Brief (L05).
 *
 *   COLLECT (code)   diff stats, blast, stored intent, description, linked issue, findings, documents
 *   GENERATE (LLM)   ONE structured call on the `risk_brief` feature model; the model never sees diff code
 *   CHECK (code)     drop paths / lines the PR cannot back, cap sizes
 *   PERSIST          one `pr_brief` row per PR, the head sha inside the JSON
 *
 * GET only reads. A generation in flight for a PR blocks a second one (409).
 */
export class BriefService {
  private repo: BriefRepository;
  /** PRs with a generation running — in memory, one API instance per DB. */
  private inFlight = new Set<string>();

  private deadlineMs: number;
  private collectMs: number;

  constructor(
    private container: Container,
    opts: BriefServiceOptions = {},
  ) {
    this.repo = new BriefRepository(container.db);
    this.deadlineMs = opts.deadlineMs ?? GENERATION_DEADLINE_MS;
    this.collectMs = opts.collectTimeoutMs ?? COLLECT_TIMEOUT_MS;
  }

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const parsed = PrBriefSchema.safeParse(await this.repo.getBrief(workspaceId, prId));
    if (!parsed.success) {
      return { brief: null, pr_head_sha: pull.headSha, stale: false, stale_reasons: [] };
    }
    const newest = await this.repo.newestReview(workspaceId, prId);
    const reasons = staleReasons(parsed.data, {
      headSha: pull.headSha,
      newestReviewId: newest?.id ?? null,
    });
    return {
      brief: parsed.data,
      pr_head_sha: pull.headSha,
      stale: reasons.length > 0,
      stale_reasons: reasons,
    };
  }

  async generate(
    workspaceId: string,
    prId: string,
    opts: { log?: BriefLogFn } = {},
  ): Promise<PrBriefResponse> {
    const log = opts.log ?? noopLog;
    const pull = await this.requirePull(workspaceId, prId);
    const repo = await this.repo.getRepo(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    if (this.inFlight.has(pull.id)) {
      throw new AppError('brief_in_progress', 'A brief is already being generated for this pull request', 409);
    }
    this.inFlight.add(pull.id);

    // One budget for the whole generation. The LLM API has no abort signal, so the lock is
    // released when the work itself settles, not when the deadline gives up on it.
    const state: RunState = { abandoned: false, committed: false, deadlineAt: Date.now() + this.deadlineMs };
    const work = this.run(workspaceId, pull, repo, log, state);
    const release = () => {
      this.inFlight.delete(pull.id);
    };
    work.then(release, release);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        if (state.committed) return; // the write started: wait for it and answer with the stored brief
        state.abandoned = true;
        reject(new AppError('brief_generation_failed', 'Brief generation timed out', 502));
      }, this.deadlineMs);
    });
    try {
      return await Promise.race([work, deadline]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async run(
    workspaceId: string,
    pull: PullRow,
    repo: RepoRow,
    log: BriefLogFn,
    state: RunState,
  ): Promise<PrBriefResponse> {
    const { provider, model } = await this.container.featureModel(workspaceId, 'risk_brief');
    let llm;
    try {
      llm = await this.container.llm(provider);
    } catch (err) {
      if (err instanceof ConfigError) {
        throw new ConfigError(`No API key for ${provider}`, { provider });
      }
      throw err;
    }

    const ref = { owner: repo.owner, name: repo.name };
    const [files, blast, intent, issue, newest, documents] = await Promise.all([
      this.loadFiles(ref, pull),
      withTimeout(this.container.blast.get(workspaceId, pull.id), this.collectMs).catch(() => null),
      withTimeout(
        this.container.intent.get(workspaceId, pull.id).then((r) => r.intent),
        this.collectMs,
      ).catch(() => null),
      this.loadIssue(ref, pull),
      this.repo.newestReview(workspaceId, pull.id),
      withTimeout(this.container.projectContext.forBrief(workspaceId, repo), this.collectMs).catch(
        (): BriefDocuments => ({ documents: [], missing: 'unreadable' }),
      ),
    ]);
    const openFindings = newest ? await this.repo.openFindings(newest.id) : null;

    const facts: BriefFacts = {
      files,
      blast: blast ? toBlastFact(blast) : null,
      intent: intent ? toIntentFact(intent, pull.headSha) : null,
      title: pull.title,
      description: pull.body ?? '',
      issue,
      findings: openFindings
        ? openFindings.map((f) => ({
            severity: f.severity,
            title: f.title,
            file: f.file,
            startLine: f.startLine,
            endLine: f.endLine,
          }))
        : null,
      documents: documents.documents,
      documentsMissing: documents.missing,
      documentsUnreadable: documents.unreadable ?? [],
    };

    const tok = this.container.tokenizer;
    const system = await renderPrompt(SYSTEM_PROMPT_FILE, {
      max_risks: String(MAX_RISKS),
      max_focus: String(MAX_FOCUS),
      max_summary: String(MAX_SUMMARY_CHARS),
    });
    const { messages, sections, inputs } = buildBriefInput(facts, system, tok);

    const logSections: LlmCallSection[] = sections.map((s) => ({
      name: s.name,
      chars: s.chars,
      tokens: s.tokens,
      truncated: s.truncated,
      original_chars: s.originalChars,
    }));
    const callBase = {
      call: 'brief' as const,
      prId: pull.id,
      provider,
      model,
      sections: logSections,
      sources: inputs.map((i) => ({
        kind: i.source,
        ref: i.ref ?? '',
        status: i.status,
        chars: null,
        truncated: i.status === 'truncated',
      })),
    };

    // The deadline fired while collecting: no paid call, nothing logged (RQ-5).
    // The attempts must fit what is left of the budget, or a paid answer would be thrown away.
    const remaining = state.deadlineAt - Date.now();
    if (state.abandoned || remaining <= 0) {
      throw new AppError('brief_generation_failed', 'Brief generation timed out', 502);
    }
    // Worst case: (MAX_RETRIES + 1) structured attempts × TRANSPORT_ATTEMPTS tries, each up to `timeoutMs`.
    const attemptMs = Math.max(
      1,
      Math.min(ATTEMPT_TIMEOUT_MS, Math.floor(remaining / ((MAX_RETRIES + 1) * TRANSPORT_ATTEMPTS))),
    );

    const started = Date.now();
    // Once the call returned, its tokens and cost are paid: every later failure record keeps them.
    let paid: { tokensIn: number; tokensOut: number; costUsd?: number | null; attempts: number } | undefined;
    try {
      const result = await llm.completeStructured({
        model,
        schema: PrBriefAnswer,
        schemaName: SCHEMA_NAME,
        messages,
        temperature: 0,
        timeoutMs: attemptMs,
        maxRetries: MAX_RETRIES,
        sessionId: `${repo.fullName}#${pull.number}:brief`,
      });
      paid = {
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        attempts: result.attempts,
      };
      const latency = Date.now() - started;
      // The deadline already answered the caller: a late answer is discarded, never stored.
      if (state.abandoned) throw new Error('Brief generation timed out');

      const checked = checkAnswer(result.data, answerContext(files, blast));
      const usedModel = result.model || model;
      const brief = PrBriefSchema.parse({
        summary: checked.summary,
        risks: checked.risks,
        review_focus: checked.review_focus,
        review_id: newest?.id ?? null,
        cost_usd: result.costUsd ?? null,
        history: [],
        head_sha: pull.headSha,
        generated_at: new Date().toISOString(),
        provider,
        model: usedModel,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        attempts: result.attempts,
        inputs,
      });
      // From here the deadline can no longer abandon the run: a stored brief is always
      // answered to the caller, a 502 is never followed by a stored brief.
      state.committed = true;
      await this.repo.upsertBrief(pull.id, brief);

      const after = buildLlmCallLog({
        ...callBase,
        model: usedModel,
        latency_ms: latency,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        cost_usd: result.costUsd ?? null,
        attempts: result.attempts,
        outcome: `risks=${brief.risks.length} focus=${brief.review_focus.length} dropped=${checked.dropped.risks + checked.dropped.focus}`,
      });
      log('result', `Brief generated: ${formatCallLine(after)}`, { ...after });
      return { brief, pr_head_sha: pull.headSha, stale: false, stale_reasons: [] };
    } catch (err) {
      // The model call was reached: every failure leaves exactly one record (NFR-3).
      const msg = redactSecrets(err instanceof Error ? err.message : String(err));
      const failed = buildLlmCallLog({
        ...callBase,
        latency_ms: Date.now() - started,
        ...(paid
          ? {
              tokens_in: paid.tokensIn,
              tokens_out: paid.tokensOut,
              cost_usd: paid.costUsd ?? null,
              attempts: paid.attempts,
            }
          : {}),
        outcome: 'failed',
      });
      log('error', `Brief failed: ${formatCallLine(failed)}`, { ...failed });
      if (err instanceof AppError) throw err;
      throw new AppError('brief_generation_failed', `Brief generation failed: ${msg}`, 502);
    }
  }

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** Stored `pr_files` first (what Files changed shows), else the git diff's hunks. */
  private async loadFiles(ref: { owner: string; name: string }, pull: PullRow): Promise<BriefFile[]> {
    const stored = await this.repo.listPrFiles(pull.id);
    if (stored.length > 0) {
      return stored.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));
    }
    let files: BriefFile[];
    try {
      const diff = await withTimeout(this.container.git.diff(ref, pull.base, pull.headSha), this.collectMs);
      files = diff.files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: null,
        ranges: f.hunks
          .filter((h) => h.newLines > 0)
          .map((h) => ({ start: h.newStart, end: h.newStart + h.newLines - 1 })),
      }));
    } catch {
      // Diff stats are never "missing": no paid call on an empty picture of the PR.
      throw new AppError('brief_generation_failed', 'Could not read the PR diff', 502);
    }
    if (files.length === 0) throw new AppError('brief_generation_failed', 'The PR diff is empty', 502);
    return files;
  }

  /** The description's first `#N` from GitHub; never throws. */
  private async loadIssue(ref: { owner: string; name: string }, pull: PullRow): Promise<BriefIssueFact> {
    const n = firstIssueNumber(pull.body ?? '');
    if (n === null) return { status: 'missing', reason: 'none_linked' };
    try {
      const github = await this.container.github();
      const issue = await withTimeout(github.getIssue(ref, n), this.collectMs);
      // `#N` names another pull request, not an issue.
      if (issue.is_pull_request) return { status: 'missing', reason: 'none_linked' };
      return { status: 'ok', number: n, title: issue.title, body: issue.body ?? '' };
    } catch (err) {
      // A 404: the reference does not resolve to an issue of this repo (a PR number, a typo).
      const status = (err as { status?: number } | null)?.status;
      return { status: 'missing', reason: status === 404 ? 'none_linked' : 'github_unavailable' };
    }
  }
}

function toBlastFact(b: BlastRadiusResponse): BriefBlastFact {
  return {
    degraded: b.degraded,
    reason: b.reason,
    summary: b.summary,
    changed_symbols: b.changed_symbols.map((s) => ({ name: s.name, file: s.file })),
    downstream: b.downstream.map((d) => ({ symbol: d.symbol, callers: d.callers })),
  };
}

function toIntentFact(i: PrIntentRecord, headSha: string) {
  return {
    intent: i.intent,
    in_scope: i.in_scope,
    out_of_scope: i.out_of_scope,
    confidence: i.confidence,
    risk_areas: i.risk_areas.map((r) => ({ kind: r.kind, label: r.label })),
    head_sha: i.head_sha,
    stale: i.head_sha !== headSha,
  };
}

/** Which files and lines the model may cite: the PR's hunks and the blast map's callers. */
function answerContext(files: BriefFile[], blast: BlastRadiusResponse | null): AnswerContext {
  const prRanges = new Map<string, LineRange[]>(
    files.map((f) => [f.path, f.ranges ?? newSideRanges(f.patch)]),
  );
  const callerLines = new Map<string, number[]>();
  if (blast && !blast.degraded) {
    for (const d of blast.downstream) {
      for (const c of d.callers) {
        if (prRanges.has(c.file)) continue;
        callerLines.set(c.file, [...(callerLines.get(c.file) ?? []), c.line]);
      }
    }
  }
  return { prRanges, callerLines };
}
