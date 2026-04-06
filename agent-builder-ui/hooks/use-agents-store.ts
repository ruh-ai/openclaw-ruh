import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DiscoveryDocuments, SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";
import type {
  AgentChannelSelection,
  AgentImprovement,
  AgentRuntimeInput,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";
import { normalizeWorkspaceMemory, type WorkspaceMemory } from "@/lib/openclaw/workspace-memory";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface SavedAgent {
  id: string;
  name: string;
  avatar: string;
  description: string;
  skills: string[];
  triggerLabel: string;
  status: "active" | "draft" | "forging";
  createdAt: string;
  sandboxIds: string[];
  // Full architect output — persisted for deployment-time config generation
  skillGraph?: SkillGraphNode[];
  workflow?: WorkflowDefinition | null;
  agentRules?: string[];
  runtimeInputs?: AgentRuntimeInput[];
  toolConnections?: AgentToolConnection[];
  triggers?: AgentTriggerDefinition[];
  improvements?: AgentImprovement[];
  channels?: AgentChannelSelection[];
  discoveryDocuments?: DiscoveryDocuments | null;
  workspaceMemory?: WorkspaceMemory;
  // LLM model preference — e.g. "claude-sonnet-4-6". Client-side only, not synced to backend.
  // undefined = use gateway default ("openclaw-default")
  model?: string;
  /** Forge sandbox — dedicated per-agent builder sandbox. Null if not forging. */
  forgeSandboxId?: string | null;
  /** Current stage in the creation lifecycle (think/plan/build/review/test/ship/complete). */
  forgeStage?: string | null;
  /** Backend-persisted creation session snapshot for recovery on page refresh. */
  creationSession?: unknown | null;
}

export interface SaveAgentDraftInput {
  agentId?: string;
  name: string;
  description: string;
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  agentRules?: string[];
  runtimeInputs?: AgentRuntimeInput[];
  toolConnections?: AgentToolConnection[];
  triggers?: AgentTriggerDefinition[];
  improvements?: AgentImprovement[];
  channels?: AgentChannelSelection[];
  discoveryDocuments?: DiscoveryDocuments | null;
  triggerLabel?: string;
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
    status: (r.status as "active" | "draft" | "forging") ?? "draft",
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
    sandboxIds: (r.sandbox_ids as string[]) ?? [],
    runtimeInputs: (r.runtime_inputs as AgentRuntimeInput[]) ?? [],
    skillGraph: r.skill_graph as SkillGraphNode[] | undefined,
    workflow: r.workflow as WorkflowDefinition | null | undefined,
    agentRules: (r.agent_rules as string[]) ?? [],
    toolConnections: (r.tool_connections as AgentToolConnection[]) ?? [],
    triggers: (r.triggers as AgentTriggerDefinition[]) ?? [],
    improvements: (r.improvements as AgentImprovement[]) ?? [],
    channels: (r.channels as AgentChannelSelection[]) ?? [],
    discoveryDocuments: (r.discovery_documents as DiscoveryDocuments | null | undefined) ?? null,
    workspaceMemory: normalizeWorkspaceMemory(r.workspace_memory),
    forgeSandboxId: (r.forge_sandbox_id as string | null) ?? null,
    forgeStage: (r.forge_stage as string | null) ?? null,
    creationSession: (r.creation_session as unknown) ?? null,
  };
}

interface AgentsStoreState {
  agents: SavedAgent[];
  isLoading: boolean;

  // Backend-synced operations
  fetchAgents: () => Promise<void>;
  fetchAgent: (id: string) => Promise<SavedAgent | null>;
  saveAgent: (agent: Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">) => Promise<string>;
  saveAgentDraft: (draft: SaveAgentDraftInput) => Promise<SavedAgent>;
  updateAgent: (id: string, patch: Partial<Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">>) => Promise<SavedAgent>;
  updateAgentConfig: (
    agentId: string,
    patch: Partial<Pick<SavedAgent, "skillGraph" | "workflow" | "agentRules" | "runtimeInputs" | "toolConnections" | "triggers" | "improvements" | "channels" | "discoveryDocuments" | "creationSession">>
  ) => Promise<SavedAgent>;
  updateAgentWorkspaceMemory: (
    agentId: string,
    patch: {
      instructions?: string;
      continuitySummary?: string;
      pinnedPaths?: string[];
    }
  ) => Promise<SavedAgent>;
  persistAgentEdits: (
    agentId: string,
    patch: Partial<Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">>
  ) => Promise<SavedAgent>;
  deleteAgent: (id: string) => Promise<void>;
  deleteForge: (id: string) => Promise<void>;
  bulkDeleteAgents: (ids: string[]) => Promise<{ deleted: string[]; failed: string[]; sandboxesCleaned: number }>;
  updateAgentStatus: (id: string, status: SavedAgent["status"]) => Promise<void>;
  addSandboxToAgent: (agentId: string, sandboxId: string) => Promise<void>;
  removeSandboxFromAgent: (agentId: string, sandboxId: string) => Promise<void>;
  restartSandbox: (sandboxId: string) => Promise<void>;
  // Forge — per-agent builder sandbox provisioning
  startForge: (agentId: string, onLog?: (message: string) => void) => Promise<string | null>;
  getForgeStatus: (agentId: string) => Promise<{ active: boolean; status: string; forge_sandbox_id?: string; vnc_port?: number | null }>;
  promoteForge: (agentId: string) => Promise<SavedAgent>;
  // Client-side only — persisted to localStorage, not synced to backend
  setAgentModel: (id: string, model: string | undefined) => void;
}

function deriveSkills(skillGraph?: SkillGraphNode[] | null): string[] {
  return skillGraph?.map((node) => node.name).filter((name) => name.trim().length > 0) ?? [];
}

function deriveTriggerLabel(
  triggerLabel?: string,
  triggers?: AgentTriggerDefinition[],
  existingLabel?: string | null,
): string {
  const explicit = triggerLabel?.trim();
  if (explicit) return explicit;

  const derived = triggers
    ?.map((trigger) => trigger.title || trigger.id)
    .filter((label): label is string => Boolean(label?.trim()))
    .join(", ");

  if (derived) return derived;

  const existing = existingLabel?.trim();
  if (existing) return existing;

  return "Manual trigger";
}

export const useAgentsStore = create<AgentsStoreState>()(
  persist(
    (set, get) => ({
      agents: [],
      isLoading: false,

      fetchAgents: async () => {
        set({ isLoading: true });
        try {
          const res = await fetchBackendWithAuth(`${API_BASE}/api/agents`);
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
          const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${id}`);
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
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents`, {
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
            runtimeInputs: agent.runtimeInputs,
            toolConnections: agent.toolConnections,
            triggers: agent.triggers,
            improvements: agent.improvements,
            channels: agent.channels,
            discoveryDocuments: agent.discoveryDocuments ?? undefined,
            // Pass forge sandbox ID so deploy page can use fast-path promotion
            ...(agent.forgeSandboxId ? { forge_sandbox_id: agent.forgeSandboxId } : {}),
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const msg = detail?.message || detail?.error || `Failed to save agent (${res.status})`;
          throw new Error(res.status === 401 ? "Not authenticated — please log in first" : msg);
        }
        const data = await res.json();
        const saved = fromBackend(data);
        set((state) => ({ agents: [saved, ...state.agents] }));
        return saved.id;
      },

      saveAgentDraft: async (draft) => {
        let existing = draft.agentId
          ? get().agents.find((agent) => agent.id === draft.agentId) ?? null
          : null;

        if (draft.agentId && !existing) {
          existing = await get().fetchAgent(draft.agentId);
        }

        const agentPayload = {
          name: draft.name,
          avatar: existing?.avatar ?? "🤖",
          description: draft.description,
          skills: deriveSkills(draft.skillGraph),
          triggerLabel: deriveTriggerLabel(draft.triggerLabel, draft.triggers, existing?.triggerLabel),
          status: existing?.status ?? "draft",
          skillGraph: draft.skillGraph ?? undefined,
          workflow: draft.workflow ?? undefined,
          agentRules: draft.agentRules ?? [],
          runtimeInputs: draft.runtimeInputs ?? [],
          toolConnections: draft.toolConnections ?? [],
          triggers: draft.triggers ?? [],
          improvements: draft.improvements ?? [],
          channels: draft.channels ?? existing?.channels ?? [],
          discoveryDocuments: draft.discoveryDocuments ?? existing?.discoveryDocuments ?? null,
        } satisfies Omit<SavedAgent, "id" | "createdAt" | "sandboxIds">;

        if (!draft.agentId) {
          const id = await get().saveAgent(agentPayload);
          const saved = get().agents.find((agent) => agent.id === id);
          if (!saved) {
            throw new Error(`Saved draft ${id} was not found in local store`);
          }
          return saved;
        }

        return get().persistAgentEdits(draft.agentId, agentPayload);
      },

      updateAgent: async (id, patch) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: patch.name,
            avatar: patch.avatar,
            description: patch.description,
            skills: patch.skills,
            triggerLabel: patch.triggerLabel,
            status: patch.status,
            channels: patch.channels,
            // Pass forge sandbox ID for deploy fast-path
            ...(patch.forgeSandboxId ? { forge_sandbox_id: patch.forgeSandboxId } : {}),
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const msg = detail?.message || detail?.error || `Failed to update agent (${res.status})`;
          throw new Error(res.status === 401 ? "Not authenticated — please log in first" : msg);
        }
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
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete agent");
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
        }));
      },

      deleteForge: async (id) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${id}/forge`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete forge");
        set((state) => ({
          agents: state.agents.filter((a) => a.id !== id),
        }));
      },

      bulkDeleteAgents: async (ids: string[]) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/bulk-delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentIds: ids }),
        });
        if (!res.ok) throw new Error("Failed to bulk delete agents");
        const data = await res.json() as { deleted: string[]; failed: string[]; sandboxesCleaned: number };
        const deletedSet = new Set(data.deleted);
        set((state) => ({
          agents: state.agents.filter((a) => !deletedSet.has(a.id)),
        }));
        return data;
      },

      updateAgentStatus: async (id, status) => {
        await get().updateAgent(id, { status });
      },

      updateAgentConfig: async (agentId, patch) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/config`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            skillGraph: patch.skillGraph,
            workflow: patch.workflow,
            agentRules: patch.agentRules,
            runtimeInputs: patch.runtimeInputs,
            toolConnections: patch.toolConnections,
            triggers: patch.triggers,
            improvements: patch.improvements,
            channels: patch.channels,
            discoveryDocuments: patch.discoveryDocuments,
            creationSession: patch.creationSession,
          }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          const msg = detail?.message || detail?.error || `Failed to update agent config (${res.status})`;
          throw new Error(res.status === 401 ? "Not authenticated — please log in first" : msg);
        }
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

      updateAgentWorkspaceMemory: async (agentId, patch) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/workspace-memory`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instructions: patch.instructions,
            continuitySummary: patch.continuitySummary,
            pinnedPaths: patch.pinnedPaths,
          }),
        });
        if (!res.ok) throw new Error("Failed to update agent workspace memory");
        const data = await res.json();
        let updated!: SavedAgent;
        set((state) => {
          const existing = state.agents.find((a) => a.id === agentId);
          if (!existing) {
            throw new Error(`Agent ${agentId} not found in local store`);
          }
          updated = {
            ...existing,
            workspaceMemory: normalizeWorkspaceMemory(data),
          };
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
          channels: patch.channels,
          // Pass forge sandbox for deploy fast-path promotion
          ...(patch.forgeSandboxId ? { forge_sandbox_id: patch.forgeSandboxId } : {}),
        };
        const configPatch = {
          skillGraph: patch.skillGraph,
          workflow: patch.workflow,
          agentRules: patch.agentRules,
          runtimeInputs: patch.runtimeInputs,
          toolConnections: patch.toolConnections,
          triggers: patch.triggers,
          improvements: patch.improvements,
          channels: patch.channels,
          discoveryDocuments: patch.discoveryDocuments,
        };

        const savedMetadata = await get().updateAgent(agentId, metadataPatch);
        const savedConfig = await get().updateAgentConfig(agentId, configPatch);

        return {
          ...savedMetadata,
          skillGraph: savedConfig.skillGraph,
          workflow: savedConfig.workflow,
          agentRules: savedConfig.agentRules,
          runtimeInputs: savedConfig.runtimeInputs,
          toolConnections: savedConfig.toolConnections,
          triggers: savedConfig.triggers,
          improvements: savedConfig.improvements,
          channels: savedConfig.channels,
          discoveryDocuments: savedConfig.discoveryDocuments,
          model: savedConfig.model,
        };
      },

      addSandboxToAgent: async (agentId, sandboxId) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/sandbox`, {
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

      removeSandboxFromAgent: async (agentId, sandboxId) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/sandbox/${sandboxId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove sandbox from agent");
        const data = await res.json();
        const updated = fromBackend(data);
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agentId ? { ...updated, model: a.model } : a)),
        }));
      },

      restartSandbox: async (sandboxId) => {
        const res = await fetch(`${API_BASE}/api/sandboxes/${sandboxId}/restart`, {
          method: "POST",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: "Restart failed" }));
          throw new Error(err.message ?? "Failed to restart sandbox");
        }
      },

      // ── Forge ─────────────────────────────────────────────────────────────

      startForge: async (agentId, onLog) => {
        // Initiate forge sandbox creation
        const initRes = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/forge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!initRes.ok) {
          const err = await initRes.json().catch(() => ({ error: "Forge failed" }));
          throw new Error(err.error ?? "Failed to start forge");
        }

        const initData = await initRes.json();

        // If forge sandbox already existed and is ready, return it immediately
        if (initData.forge_sandbox_id && initData.status === "ready") {
          // Refresh agent in store
          const agent = get().agents.find((a) => a.id === agentId);
          if (agent) {
            set((state) => ({
              agents: state.agents.map((a) =>
                a.id === agentId ? { ...a, forgeSandboxId: initData.forge_sandbox_id, status: "forging" as const } : a
              ),
            }));
          }
          return initData.forge_sandbox_id as string;
        }

        // Stream SSE progress for new sandbox creation
        const streamId = initData.stream_id as string;
        if (!streamId) throw new Error("No stream_id returned from forge");

        const sseRes = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/forge/stream/${streamId}`);
        if (!sseRes.ok || !sseRes.body) throw new Error("Failed to open forge SSE stream");

        const reader = sseRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let forgeSandboxId: string | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const block of events) {
              if (!block.trim()) continue;
              let eventName = "";
              const dataLines: string[] = [];

              for (const line of block.split("\n")) {
                if (line.startsWith("event: ")) eventName = line.slice(7).trim();
                else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
              }

              const dataStr = dataLines.join("\n");
              if (!eventName || !dataStr) continue;

              try {
                const parsed = JSON.parse(dataStr);
                if (eventName === "log") {
                  onLog?.(parsed.message ?? "");
                } else if (eventName === "result") {
                  forgeSandboxId = (parsed.sandbox_id as string) ?? null;
                } else if (eventName === "error") {
                  throw new Error(parsed.message ?? "Forge sandbox creation failed");
                }
              } catch (e) {
                if (e instanceof Error && e.message.includes("failed")) throw e;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Refresh agent in store
        if (forgeSandboxId) {
          const fetchRes = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}`);
          if (fetchRes.ok) {
            const data = await fetchRes.json();
            const updated = fromBackend(data);
            set((state) => ({
              agents: state.agents.map((a) => (a.id === agentId ? { ...updated, model: a.model } : a)),
            }));
          }
        }

        return forgeSandboxId;
      },

      getForgeStatus: async (agentId) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/forge/status`);
        if (!res.ok) throw new Error("Failed to get forge status");
        return res.json();
      },

      promoteForge: async (agentId) => {
        const res = await fetchBackendWithAuth(`${API_BASE}/api/agents/${agentId}/forge/promote`, {
          method: "POST",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Promote failed" }));
          throw new Error(err.error ?? "Failed to promote forge");
        }
        const data = await res.json();
        const updated = fromBackend(data);
        const existing = get().agents.find((a) => a.id === agentId);
        set((state) => ({
          agents: state.agents.map((a) => (a.id === agentId ? { ...updated, model: existing?.model } : a)),
        }));
        return updated;
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
