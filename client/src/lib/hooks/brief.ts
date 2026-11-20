/* hooks/brief.ts — React Query hooks for the PR Brief (L05).
   GET never calls a model; Generate is one explicit paid call. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBriefResponse } from "@devdigest/shared";

/** Query key of a PR's brief — reuse it to invalidate. */
export const prBriefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBriefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** (Re-)generate the PR brief; the response is written straight into the cache. */
export function useGenerateBrief(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (res) => qc.setQueryData(prBriefKey(prId), res),
  });
}
