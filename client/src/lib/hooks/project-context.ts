/* hooks/project-context.ts — React Query hooks for Project Context (L05): the
   repo's markdown documents, their attachment to agents and skills (ordered
   paths; optimistic save), Rescan, and saving an edit as a GitHub PR.
   No route here calls a model. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextAttachmentItem,
  ContextAttachments,
  ContextDocList,
  ContextDocument,
  ContextSaveRequest,
  ContextSaveResult,
} from "@devdigest/shared";

/** Whose attachment list a Context tab edits. */
export type ContextOwnerKind = "agent" | "skill";

export const contextDocsKey = (repoId: string | null | undefined) => ["context-docs", repoId] as const;
export const contextDocKey = (repoId: string | null | undefined, path: string | null | undefined) =>
  ["context-doc", repoId, path] as const;
export const contextAttachmentsKey = (kind: ContextOwnerKind, id: string, repoId: string | null | undefined) =>
  ["context-attachments", kind, id, repoId ?? null] as const;

const attachmentsUrl = (kind: ContextOwnerKind, id: string, repoId: string | null | undefined) =>
  `/${kind}s/${id}/context${repoId ? `?repo_id=${encodeURIComponent(repoId)}` : ""}`;

export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextDocsKey(repoId),
    queryFn: () => api.get<ContextDocList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useContextDocument(repoId: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: contextDocKey(repoId, path),
    queryFn: () =>
      api.get<ContextDocument>(`/repos/${repoId}/context/document?path=${encodeURIComponent(path ?? "")}`),
    enabled: !!repoId && !!path,
  });
}

/** Sync the clone to the latest default branch and re-list (rate-limited server-side). */
export function useRescanContext(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ContextDocList>(`/repos/${repoId}/context/rescan`),
    onSuccess: (list) => {
      qc.setQueryData(contextDocsKey(repoId), list);
      void qc.invalidateQueries({ queryKey: ["context-doc", repoId] });
      void qc.invalidateQueries({ queryKey: ["context-attachments"] });
    },
  });
}

/** Commit to a new branch and open a PR; the clone (and so the list) is unchanged. */
export function useSaveContextDocument(repoId: string) {
  return useMutation({
    mutationFn: (body: ContextSaveRequest) =>
      api.post<ContextSaveResult>(`/repos/${repoId}/context/documents`, body),
  });
}

export function useContextAttachments(
  kind: ContextOwnerKind,
  id: string,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: contextAttachmentsKey(kind, id, repoId),
    queryFn: () => api.get<ContextAttachments>(attachmentsUrl(kind, id, repoId)),
  });
}

/**
 * Save the whole ordered path list. Optimistic: own rows take the new order at
 * once (inherited rows stay after them); totals refresh from the response.
 */
export function useSetContextAttachments(
  kind: ContextOwnerKind,
  id: string,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  const key = contextAttachmentsKey(kind, id, repoId);
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ContextAttachments>(attachmentsUrl(kind, id, repoId), { paths }),
    onMutate: async (paths) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContextAttachments>(key);
      if (previous) {
        const own = new Map(previous.items.filter((i) => !i.via_skill).map((i) => [i.path, i]));
        const items: ContextAttachmentItem[] = [
          ...paths.map(
            (path) =>
              own.get(path) ?? {
                path,
                via_skill: null,
                status: "unknown" as const,
                tokens: null,
                truncated: false,
                dropped: false,
              },
          ),
          ...previous.items.filter((i) => i.via_skill && !paths.includes(i.path)),
        ];
        qc.setQueryData<ContextAttachments>(key, { ...previous, items });
      }
      return { previous };
    },
    onError: (_e, _paths, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (view) => qc.setQueryData(key, view),
    onSettled: () => {
      // "Used by N agents" and every agent inheriting a skill's list change too.
      void qc.invalidateQueries({ queryKey: ["context-docs"] });
      void qc.invalidateQueries({ queryKey: ["context-doc"] });
      if (kind === "skill") void qc.invalidateQueries({ queryKey: ["context-attachments", "agent"] });
    },
  });
}
