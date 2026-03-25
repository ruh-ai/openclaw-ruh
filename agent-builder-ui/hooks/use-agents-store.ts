import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SavedAgent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  triggerLabel: string;
  status: "active" | "draft";
  createdAt: string;
  sandboxIds: string[];
  // Full architect output — persisted for deployment-time config generation
  skillGraph?: SkillGraphNode[];
  workflow?: WorkflowDefinition | null;
  agentRules?: string[];
  // LLM model preference — e.g. "claude-sonnet-4-6". Client-side only, not synced to backend.
  // undefined = use gateway default ("openclaw-default")
  model?: string;
}

/** Map backend snake_case AgentRecord to frontend camelCase SavedAgent */
function fromBackend(r: Record<string, unknown>): SavedAgent {
  return {
    id: r.id as string,
    name: r.name as string,
    avatar: (r.avatar as string) ?? "",
    description: (r.description as string) ?? "",
    skills: (r.skills as string[]) ?? [],
    triggerLabel: (r.trigger_label as string) ?? "",
    status: (r.status as "active" | "draft") ?? "draft",
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    sandboxIds: (r.sandbox_ids as string[]) ?? [],
    skillGraph: r.skill_graph as SkillGraphNode[] | undefined,
    workflow: r.workflow as WorkflowDefinition | null | undefined,
    agentRules: (r.agent_rules as string[]) ?? [],
  };
}

interface AgentsStoreState {
  agents: SavedAgent[];
  isLoading: boolean;

  // Backend-synced operations
  fetchAgents: () => Promise<void>;
  fetchAgent: (id: string) => Promise<SavedAgent | null>;
  saveAgent: (agent: Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">) => Promise<string>;
  updateAgent: (id: string, patch: Partial<Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">>) => Promise<SavedAgent>;
  updateAgentConfig: (agentId: string, patch: Pick<SavedAgent, "skillGraph" | "workflow" | "agentRules">) => Promise<SavedAgent>;
  persistAgentEdits: (
    agentId: string,
    patch: Partial<Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">>
  ) => Promise<SavedAgent>;
  deleteAgent: (id: string) => Promise<void>;
  updateAgentStatus: (id: string, status: SavedAgent["status"]) => Promise<void>;
  addSandboxToAgent: (agentId: string, sandboxId: string) => Promise<void>;
  // Client-side only — persisted to localStorage, not synced to backend
  setAgentModel: (id: string, model: string | undefined) => void;
}

export const useAgentsStore = create<AgentsStoreState>()(
  persist(
    (set, get) => ({
      agents: [],
      isLoading: false,

      fetchAgents: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch(`${API_BASE}/api/agents`);
          if (!res.ok) throw new Error("Failed to fetch agents");
          const data = await res.json();
          // Preserve client-only fields (e.g. model) that are not synced to the backend
          set((state) => {
            const localById = Object.fromEntries(state.agents.map((a) => [a.id, a]));
            return {
              agents: data.map((r: Record<string, unknown>) => ({
                ...fromBackend(r),
                model: localById[r.id as string]?.model,
              })),
            };
          });
        } catch {
          // Keep existing local state as fallback
        } finally {
          set({ isLoading: false });
        }
      },

      fetchAgent: async (id: string) => {
        try {
          const res = await fetch(`${API_BASE}/api/agents/${id}`);
          if (!res.ok) return null;
          const data = await res.json();
          // Preserve client-only fields when merging backend response
          set((state) => {
            const existing = state.agents.find((a) => a.id === id);
            const agent = { ...fromBackend(data), model: existing?.model };
            const exists = state.agents.some((a) => a.id === id);
            if (exists) {
              return { agents: state.agents.map((a) => (a.id === id ? agent : a)) };
            }
            return { agents: [agent, ...state.agents] };
          });
          return get().agents.find((a) => a.id === id) ?? null;
        } catch {
          return null;
        }
      },

      saveAgent: async (agent) => {
        const res = await fetch(`${API_BASE}/api/agents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: agent.name,
            avatar: agent.avatar,
            description: agent.description,
            skills: agent.skills,
            triggerLabel: agent.triggerLabel,
            status: agent.status,
            skillGraph: agent.skillGraph,
            workflow: agent.workflow,
            agentRules: agent.agentRules,
          }),
        });
        if (!res.ok) throw new Error("Failed to save agent");
        const data = await res.json();
        const saved = fromBackend(data);
        set((state) => ({ agents: [saved, ...state.agents] }));
        return saved.id;
      },

      updateAgent: async (id, patch) => {
        const res = await fetch(`${API_BASE}/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: patch.name,
            avatar: patch.avatar,
            description: patch.description,
            skills: patch.skills,
            triggerLabel: patch.triggerLabel,
            status: patch.status,
          }),
        });
        if (!res.ok) throw new Error("Failed to update agent");
        const data = await res.json();
        let updated!: SavedAgent;
        set((state) => {
          const existing = state.agents.find((a) => a.id === id);
          updated = { ...fromBackend(data), model: existing?.model };
          return {
            agents: state.agents.map((a) => (a.id === id ? updated : a)),
          };
        });
        return updated;
      },

      deleteAgent: async (id) => {
        const res = await fetch(`${API_BASE}/api/agents/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete agent");
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
        }));
      },

      updateAgentStatus: async (id, status) => {
        await get().updateAgent(id, { status });
      },

      updateAgentConfig: async (agentId, patch) => {
        const res = await fetch(`${API_BASE}/api/agents/${agentId}/config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillGraph: patch.skillGraph,
            workflow: patch.workflow,
            agentRules: patch.agentRules,
          }),
        });
        if (!res.ok) throw new Error("Failed to update agent config");
        const data = await res.json();
        let updated!: SavedAgent;
        set((state) => {
          const existing = state.agents.find((a) => a.id === agentId);
          updated = { ...fromBackend(data), model: existing?.model };
          return {
            agents: state.agents.map((a) => (a.id === agentId ? updated : a)),
          };
        });
        return updated;
      },

      persistAgentEdits: async (agentId, patch) => {
        const metadataPatch = {
          name: patch.name,
          avatar: patch.avatar,
          description: patch.description,
          skills: patch.skills,
          triggerLabel: patch.triggerLabel,
          status: patch.status,
        };
        const configPatch = {
          skillGraph: patch.skillGraph,
          workflow: patch.workflow,
          agentRules: patch.agentRules,
        };

        const savedMetadata = await get().updateAgent(agentId, metadataPatch);
        const savedConfig = await get().updateAgentConfig(agentId, configPatch);

        return {
          ...savedMetadata,
          skillGraph: savedConfig.skillGraph,
          workflow: savedConfig.workflow,
          agentRules: savedConfig.agentRules,
          model: savedConfig.model,
        };
      },

      addSandboxToAgent: async (agentId, sandboxId) => {
        const res = await fetch(`${API_BASE}/api/agents/${agentId}/sandbox`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sandbox_id: sandboxId }),
        });
        if (!res.ok) throw new Error("Failed to add sandbox to agent");
        const data = await res.json();
        const updated = fromBackend(data);
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agentId ? { ...updated, model: a.model } : a)),
        }));
      },

      setAgentModel: (id, model) => {
        set((state) => ({
          agents: state.agents.map((a) => (a.id === id ? { ...a, model } : a)),
        }));
      },
    }),
    {
      name: "openclaw-agents",
    }
  )
);
