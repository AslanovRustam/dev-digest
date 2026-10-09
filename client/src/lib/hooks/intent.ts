/* hooks/intent.ts — React Query hooks for the Intent layer (L03).
   GET never calls a model; the derive mutation is one cheap paid call. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

const key = (prId: string | null | undefined) => ["pr-intent", prId] as const;

export function usePrIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

/** (Re-)derive the PR intent; the response is written straight into the cache. */
export function useDeriveIntent(prId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent`),
    onSuccess: (res) => qc.setQueryData(key(prId), res),
  });
}
