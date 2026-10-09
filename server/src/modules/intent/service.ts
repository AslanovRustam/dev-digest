import type {
  GitHubClient,
  IntentSource,
  PrDetail,
  PrIntentRecord,
  PrIntentResponse,
  UnifiedDiff,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import {
  buildLlmCallLog,
  formatCallLine,
  redactSecrets,
  type LlmCallSection,
} from '../../platform/llm-call-log.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import type { PullRow, RepoRow } from '../../db/rows.js';
import { IntentRepository } from './repository.js';
import {
  CLASSIFIER_MAX_RETRIES,
  CLASSIFIER_TIMEOUT_MS,
  CLASSIFY_SCHEMA_NAME,
  MAX_DOC_BYTES,
  MAX_REFERENCES,
  MAX_RISK_AREAS,
  MAX_SCOPE_ITEMS,
  SYSTEM_PROMPT_FILE,
} from './constants.js';
import {
  IntentClassification,
  addedDependencies,
  applyStoredCounts,
  buildClassifierMessages,
  clampClassification,
  computeConfidence,
  countRefFailures,
  describeFailure,
  fileListSection,
  isStale,
  mergeRiskAreas,
  missingContextLines,
  planFailureReason,
  rawFromPatches,
  shortSha,
  toRecord,
  type ClassifierDoc,
  type ClassifierIssue,
  type ParsedRef,
  extractReferences,
} from './helpers.js';
import type { IntentFacade, IntentLogFn } from './types.js';

const noopLog: IntentLogFn = () => undefined;

interface Collected {
  issues: ClassifierIssue[];
  issueSources: IntentSource[];
  docs: ClassifierDoc[];
  docSources: IntentSource[];
  /** Sources that were never sent to the model (unsupported, no credentials, skipped, failed). */
  otherSources: IntentSource[];
}

/**
 * Intent layer (L03).
 *
 *   COLLECT (code)  title, description, linked issues / plans (GitHub API only), file list
 *   CLASSIFY (LLM)  one cheap structured call → summary, scope, risk areas, confidence
 *   CAP (code)      confidence min(model, cap), clamps, code-derived dependency risks
 *   PERSIST         one `pr_intent` row per PR, tagged with the head sha it was derived from
 *
 * The classifier never sees diff bodies, and a failure never fails a review.
 */
export class IntentService implements IntentFacade {
  private repo: IntentRepository;

  constructor(private container: Container) {
    this.repo = new IntentRepository(container.db);
  }

  async get(workspaceId: string, prId: string): Promise<PrIntentResponse> {
    const pull = await this.requirePull(workspaceId, prId);
    const row = await this.repo.get(workspaceId, prId);
    return {
      intent: row ? toRecord(row) : null,
      pr_head_sha: pull.headSha,
      stale: row ? isStale(row.headSha, pull.headSha) : false,
    };
  }

  async derive(
    workspaceId: string,
    prId: string,
    opts: { diff?: UnifiedDiff; log?: IntentLogFn } = {},
  ): Promise<PrIntentResponse> {
    const log = opts.log ?? noopLog;
    const pull = await this.requirePull(workspaceId, prId);
    const repo = await this.repo.getRepo(workspaceId, pull.repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    const ref = { owner: repo.owner, name: repo.name };

    // GitHub is optional: without a token, GitHub-hosted references are recorded as no_credentials.
    let github: GitHubClient | null | undefined;
    const getGithub = async (): Promise<GitHubClient | null> => {
      if (github === undefined) github = await this.container.github().catch(() => null);
      return github;
    };
    // Live PR detail is only fetched when the DB lacks the body / files (the pulls module
    // persists them lazily, on first GET /pulls/:id). Nothing is persisted from here.
    let detail: PrDetail | null | undefined;
    const getDetail = async (): Promise<PrDetail | null> => {
      if (detail === undefined) {
        const gh = await getGithub();
        detail = gh ? await gh.getPullRequest(ref, pull.number).catch(() => null) : null;
      }
      return detail;
    };

    // 1. description
    let body = pull.body;
    if (body === null) {
      body = (await getDetail())?.body ?? null;
      if (body !== null) log('info', 'Intent: description fetched live (PR detail not opened yet)');
    }
    const description = body ?? '';
    const descriptionEmpty = description.trim().length === 0;

    // 2. changed files (paths + hunk headers; raw only for package.json)
    const diff = opts.diff ?? (await this.loadDiff(ref, pull, getDetail));

    // 3. references → issues / plans (GitHub API only, same repo only)
    const parsed = extractReferences(description, pull.title, pull.branch, ref);
    const collected = await this.collect(parsed, pull, ref, getGithub);

    // 4. classifier prompt (no diff bodies)
    const dependencies = addedDependencies(diff);
    const fileList = fileListSection(diff);
    const refSources = [...collected.issueSources, ...collected.docSources, ...collected.otherSources];
    const missingNotes = missingContextLines(refSources, descriptionEmpty);
    const system = await renderPrompt(SYSTEM_PROMPT_FILE, {
      max_items: String(MAX_SCOPE_ITEMS),
      max_risks: String(MAX_RISK_AREAS),
    });
    const { messages, sections } = buildClassifierMessages({
      system,
      title: pull.title,
      description,
      issues: collected.issues,
      docs: collected.docs,
      fileList,
      dependencies,
      missingNotes,
    });
    const sizeOf = (name: string) => sections.find((s) => s.name === name);
    collected.issueSources.forEach((s, i) => {
      const sec = sizeOf(`issue-${i + 1}`);
      if (sec) {
        s.chars = sec.chars;
        s.truncated = sec.truncated;
      }
    });
    collected.docSources.forEach((s, i) => {
      const sec = sizeOf(`doc-${i + 1}`);
      if (sec) {
        s.chars = sec.chars;
        s.truncated = sec.truncated;
      }
    });
    const sources: IntentSource[] = [
      { kind: 'title', ref: 'title', status: 'used', reason: null, chars: sizeOf('pr-title')?.chars ?? 0, truncated: sizeOf('pr-title')?.truncated ?? false },
      descriptionEmpty
        ? { kind: 'description', ref: 'description', status: 'skipped', reason: 'PR description is empty', chars: 0, truncated: false }
        : { kind: 'description', ref: 'description', status: 'used', reason: null, chars: sizeOf('pr-description')?.chars ?? 0, truncated: sizeOf('pr-description')?.truncated ?? false },
      ...refSources,
      { kind: 'file_list', ref: `${diff.files.length} file(s)`, status: 'used', reason: null, chars: fileList.length, truncated: false },
    ];

    // 5. model call (the cheap `review_intent` feature model)
    const { provider, model } = await this.container.featureModel(workspaceId, 'review_intent');
    const llm = await this.container.llm(provider);
    const logSections: LlmCallSection[] = sections.map((s) => ({
      name: s.name,
      chars: s.chars,
      tokens: this.container.tokenizer.count(s.text),
      truncated: s.truncated,
      original_chars: s.originalChars,
    }));
    const callBase = {
      call: 'intent' as const,
      prId: pull.id,
      provider,
      model,
      sections: logSections,
      sources: sources.map((s) => ({ kind: s.kind, ref: s.ref, status: s.status, chars: s.chars, truncated: s.truncated })),
    };
    const before = buildLlmCallLog(callBase);
    log('tool', formatCallLine(before), { ...before });

    const started = Date.now();
    let result;
    try {
      result = await llm.completeStructured({
        model,
        schema: IntentClassification,
        schemaName: CLASSIFY_SCHEMA_NAME,
        messages,
        temperature: 0,
        timeoutMs: CLASSIFIER_TIMEOUT_MS,
        maxRetries: CLASSIFIER_MAX_RETRIES,
        sessionId: `${repo.fullName}#${pull.number}:intent`,
      });
    } catch (err) {
      const msg = redactSecrets(err instanceof Error ? err.message : String(err));
      throw new AppError('intent_derivation_failed', `Intent classification failed: ${msg}`, 502);
    }
    const durationMs = Date.now() - started;

    // 6. caps + persistence
    const clamped = clampClassification(result.data);
    const refFailures = countRefFailures(refSources);
    const confidence = computeConfidence({ model: clamped.confidence, descriptionEmpty, refFailures });
    const usedModel = result.model || model;
    const row = await this.repo.upsert({
      prId: pull.id,
      intent: clamped.summary,
      inScope: clamped.in_scope,
      outOfScope: clamped.out_of_scope,
      headSha: pull.headSha,
      confidence,
      sources,
      missingContext: missingContextLines(sources, descriptionEmpty),
      riskAreas: mergeRiskAreas(dependencies, clamped.risk_areas),
      provider,
      model: usedModel,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd ?? null,
      durationMs,
    });

    const after = buildLlmCallLog({
      ...callBase,
      model: usedModel,
      latency_ms: durationMs,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd ?? null,
      attempts: result.attempts,
      outcome: `confidence=${confidence} risk_areas=${row.riskAreas.length}`,
    });
    log('result', `Intent derived: ${formatCallLine(after)}`, { ...after });

    return { intent: toRecord(row), pr_head_sha: pull.headSha, stale: false };
  }

  async forReview(
    workspaceId: string,
    pull: PullRow,
    _repo: RepoRow,
    diff: UnifiedDiff,
    log: IntentLogFn,
  ): Promise<PrIntentRecord | null> {
    try {
      const stored = await this.repo.get(workspaceId, pull.id);
      if (stored) {
        const stale = isStale(stored.headSha, pull.headSha);
        log(
          'info',
          `Intent reused (derived from ${shortSha(stored.headSha)}; PR head ${shortSha(pull.headSha)}${
            stale ? ' — STALE, re-derive from the Intent card' : ''
          })`,
        );
        return toRecord(stored);
      }
      const res = await this.derive(workspaceId, pull.id, { diff, log });
      return res.intent;
    } catch (err) {
      const msg = redactSecrets(err instanceof Error ? err.message : String(err));
      log('error', `Intent derivation failed: ${msg} — reviewing without intent`);
      return null;
    }
  }

  // ---- internals --------------------------------------------------------------

  private async requirePull(workspaceId: string, prId: string): Promise<PullRow> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /** git diff first, then stored pr_files, then the live GitHub detail. */
  private async loadDiff(
    ref: { owner: string; name: string },
    pull: PullRow,
    getDetail: () => Promise<PrDetail | null>,
  ): Promise<UnifiedDiff> {
    try {
      const diff = await this.container.git.diff(ref, pull.base, pull.headSha);
      if (diff.files.length > 0) return diff;
    } catch {
      /* no clone yet → fall through */
    }
    const stored = await this.repo.listPrFiles(pull.id);
    if (stored.length > 0) return applyStoredCounts(parseUnifiedDiff(rawFromPatches(stored)), stored);
    const live = await getDetail();
    if (live && live.files.length > 0) {
      return applyStoredCounts(parseUnifiedDiff(rawFromPatches(live.files)), live.files);
    }
    return { raw: '', files: [] };
  }

  /** Fetch the first MAX_REFERENCES fetchable references; record every other one by code. */
  private async collect(
    parsed: ParsedRef[],
    pull: PullRow,
    ref: { owner: string; name: string },
    getGithub: () => Promise<GitHubClient | null>,
  ): Promise<Collected> {
    const out: Collected = { issues: [], issueSources: [], docs: [], docSources: [], otherSources: [] };
    const record = (r: ParsedRef, status: IntentSource['status'], reason: string): void => {
      out.otherSources.push({
        kind: r.kind,
        ref: r.ref,
        status,
        reason: redactSecrets(reason),
        chars: null,
        truncated: false,
      });
    };

    const fetchable: ParsedRef[] = [];
    for (const r of parsed) {
      if (r.fixed) record(r, r.fixed.status, r.fixed.reason);
      else if (fetchable.length < MAX_REFERENCES) fetchable.push(r);
      else record(r, 'skipped', `only the first ${MAX_REFERENCES} references are read`);
    }
    if (fetchable.length === 0) return out;

    const gh = await getGithub();
    if (!gh) {
      for (const r of fetchable) record(r, 'no_credentials', 'GITHUB_TOKEN is not configured');
      return out;
    }

    const settled = await Promise.all(
      fetchable.map(async (r) => {
        try {
          if (r.kind === 'issue' && r.number !== undefined) {
            const issue = await gh.getIssue(ref, r.number);
            return { r, issue, file: null, failure: null };
          }
          if (r.kind === 'plan' && r.path) {
            // Read at the PR head, never at the ref a URL names.
            const file = await gh.getFileAtRef(ref, r.path, pull.headSha, MAX_DOC_BYTES);
            return { r, issue: null, file, failure: null };
          }
          return {
            r,
            issue: null,
            file: null,
            failure: { status: 'unsupported' as const, reason: 'not fetchable' },
          };
        } catch (err) {
          return { r, issue: null, file: null, failure: describeFailure(err) };
        }
      }),
    );
    for (const s of settled) {
      if (s.issue) {
        out.issues.push({ ref: s.r.ref, title: s.issue.title, state: s.issue.state, body: s.issue.body });
        out.issueSources.push({ kind: 'issue', ref: s.r.ref, status: 'used', reason: null, chars: null, truncated: false });
      } else if (s.file) {
        out.docs.push({ path: s.r.path ?? s.r.ref, content: s.file.content });
        out.docSources.push({ kind: 'plan', ref: s.r.ref, status: 'used', reason: null, chars: null, truncated: false });
      } else {
        const failure = s.failure ?? { status: 'unreachable' as const, reason: 'GitHub request failed' };
        const reason = s.r.kind === 'plan' ? planFailureReason(failure, pull.headSha) : failure.reason;
        record(s.r, failure.status, reason);
      }
    }
    return out;
  }
}
