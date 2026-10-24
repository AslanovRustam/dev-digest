/* hooks/blast.ts — React Query hook for the PR blast radius (L05).
   GET reads the precomputed repo index; it never calls a model. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadiusResponse } from "@devdigest/shared";

/** Query key of a PR's blast radius. */
export const prBlastKey = (prId: string | null | undefined) => ["pr-blast", prId] as const;

export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: prBlastKey(prId),
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
