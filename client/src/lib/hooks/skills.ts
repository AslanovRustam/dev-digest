/* hooks/skills.ts — React Query hooks for the Skills page (L02) and the agent
   editor's Skills tab. Server contracts: specs/03-skills.md. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  AgentSkillsSet,
  Skill,
  SkillCreate,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillUpdate,
  SkillVersion,
} from "@devdigest/shared";

// ---- Skills (workspace library) -------------------------------------------

export function useSkills() {
  return useQuery({
    queryKey: ["skills"],
    queryFn: () => api.get<Skill[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill", id],
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-versions", id],
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-stats", id],
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/** Refresh everything that shows a skill after it changed. */
function invalidateSkill(qc: ReturnType<typeof useQueryClient>, skill: Skill) {
  qc.invalidateQueries({ queryKey: ["skills"] });
  qc.invalidateQueries({ queryKey: ["skill-versions", skill.id] });
  qc.invalidateQueries({ queryKey: ["agents"] }); // skill_count depends on skills.enabled
  qc.setQueryData(["skill", skill.id], skill);
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreate) => api.post<Skill>("/skills", input),
    onSuccess: (skill) => invalidateSkill(qc, skill),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SkillUpdate }) =>
      api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (skill) => invalidateSkill(qc, skill),
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["agent-skills"] });
      qc.removeQueries({ queryKey: ["skill", id] });
    },
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (skill) => invalidateSkill(qc, skill),
  });
}

/** Parse-only: the server returns what it would import; nothing is stored. */
export function usePreviewSkillImport() {
  return useMutation({
    mutationFn: (input: SkillImportRequest) =>
      api.post<SkillImportPreview>("/skills/import/preview", input),
  });
}

// ---- Agent ⇄ skill links (agent editor, Skills tab) -------------------------

export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-skills", agentId],
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's ordered skill set (order = array index). Optimistic: the
 * list re-renders at once and rolls back if the server rejects it.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = ["agent-skills", agentId];
  return useMutation({
    mutationFn: (body: AgentSkillsSet) => api.put<AgentSkillLink[]>(`/agents/${agentId}/skills`, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        body.items.map((it, order) => ({ agent_id: agentId, skill_id: it.skill_id, enabled: it.enabled, order })),
      );
      return { previous };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (links) => qc.setQueryData(key, links),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
