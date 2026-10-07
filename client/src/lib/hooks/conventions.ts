/* hooks/conventions.ts — React Query hooks for the Conventions Extractor (L02).
   Server contracts: specs/04-conventions-extractor.md. Every mutation that
   changes candidates returns the full ConventionsList, written straight into
   the cache. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionBulkStatus,
  ConventionPatch,
  ConventionSkillCreate,
  ConventionSkillCreated,
  ConventionSkillDraft,
  ConventionsList,
} from "@devdigest/shared";

const key = (repoId: string | null | undefined) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: key(repoId),
    queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/** Run a scan: sample → LLM → evidence gate. One paid call; takes a few seconds. */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsList>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (list) => qc.setQueryData(key(repoId), list),
  });
}

/** Accept / reject / edit one candidate — optimistic, rolled back on error. */
export function usePatchConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionPatch }) =>
      api.patch<ConventionsList>(`/repos/${repoId}/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key(repoId) });
      const prev = qc.getQueryData<ConventionsList>(key(repoId));
      if (prev) {
        qc.setQueryData<ConventionsList>(key(repoId), {
          ...prev,
          candidates: prev.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key(repoId), ctx.prev);
    },
    onSuccess: (list) => qc.setQueryData(key(repoId), list),
  });
}

export function useBulkConventionStatus(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionBulkStatus) =>
      api.post<ConventionsList>(`/repos/${repoId}/conventions/status`, input),
    onSuccess: (list) => qc.setQueryData(key(repoId), list),
  });
}

/** Editable skill draft for the given accepted candidates. Stores nothing. */
export function useConventionSkillDraft(repoId: string, ids: string[], enabled: boolean) {
  return useQuery({
    queryKey: ["conventions-draft", repoId, ids],
    queryFn: () =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill/draft`, {
        convention_ids: ids,
      }),
    enabled: enabled && ids.length > 0,
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useCreateSkillFromConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionSkillCreate) =>
      api.post<ConventionSkillCreated>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key(repoId) });
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
    },
  });
}
