/* hooks/intent.ts — React Query hooks for the Intent layer (L03).
   GET never calls a model; the derive mutation is one cheap paid call. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

/** Query key of a PR's intent — reuse it to invalidate (e.g. after a review run may have derived one). */
export const prIntentKey = (prId: string | null | undefined) => ["pr-intent", prId] as const;

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: prIntentKey(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** (Re-)derive the PR intent; the response is written straight into the cache. */
export function useDeriveIntent(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (res) => qc.setQueryData(prIntentKey(prId), res),
  });
}
