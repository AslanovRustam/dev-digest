/** Ring 2: "owner/name" + PR number -> API ids. */
import { KNOWN_LIST_LIMIT } from './constants.js';
import { PrList, RepoList } from './contracts.js';
import {
  apiRequestFailed,
  apiServerError,
  apiTimeout,
  apiUnreachable,
  badShape,
  prNotFound,
  rateLimited,
  repoFormatInvalid,
  repoNotFound,
} from './messages.js';
import type { ApiClient, ApiError } from './ports.js';

/** Safe, actionable text for an API failure (5xx bodies never reach here: the adapter redacts them). */
export function apiErrorText(error: ApiError, apiUrl: string): string {
  switch (error.kind) {
    case 'unreachable':
      return apiUnreachable(apiUrl);
    case 'timeout':
      return apiTimeout();
    case 'bad_shape':
      return badShape();
    case 'http':
      if (error.status === 429) return rateLimited();
      if (error.status >= 500) return apiServerError();
      return apiRequestFailed(error.status, error.message);
  }
}

export function failureText(failure: ResolveFailure, apiUrl: string): string {
  return failure.kind === 'api' ? apiErrorText(failure.error, apiUrl) : failure.message;
}

export type ResolveFailure =
  | { kind: 'api'; error: ApiError }
  | { kind: 'invalid' | 'not_found'; message: string };

export type Resolved<T> = { ok: true; value: T } | { ok: false; failure: ResolveFailure };

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export async function resolveRepo(
  api: ApiClient,
  fullName: string,
  signal?: AbortSignal,
): Promise<Resolved<string>> {
  if (!REPO_RE.test(fullName)) {
    return { ok: false, failure: { kind: 'invalid', message: repoFormatInvalid() } };
  }
  const res = await api.get('/repos', RepoList, signal);
  if (!res.ok) return { ok: false, failure: { kind: 'api', error: res.error } };
  const wanted = fullName.toLowerCase();
  const hit = res.value.find((r) => r.full_name.toLowerCase() === wanted);
  if (!hit) {
    const known = res.value.slice(0, KNOWN_LIST_LIMIT).map((r) => r.full_name);
    return { ok: false, failure: { kind: 'not_found', message: repoNotFound(fullName, known) } };
  }
  return { ok: true, value: hit.id };
}

/** Returns the PR uuid. `repoId` comes from the API (a uuid), still encoded for the path. */
export async function resolvePr(
  api: ApiClient,
  repoId: string,
  repoName: string,
  prNumber: number,
  signal?: AbortSignal,
): Promise<Resolved<string>> {
  const res = await api.get(`/repos/${encodeURIComponent(repoId)}/pulls`, PrList, signal);
  if (!res.ok) return { ok: false, failure: { kind: 'api', error: res.error } };
  const hit = res.value.find((p) => p.number === prNumber && typeof p.id === 'string' && p.id !== '');
  if (!hit || !hit.id) {
    const known = res.value.slice(0, KNOWN_LIST_LIMIT).map((p) => p.number);
    return {
      ok: false,
      failure: { kind: 'not_found', message: prNotFound(prNumber, repoName, known) },
    };
  }
  return { ok: true, value: hit.id };
}
