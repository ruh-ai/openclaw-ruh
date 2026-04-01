"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Pencil,
  Calendar,
  Heart,
  PersonStanding,
  FileJson,
  X,
  Plus,
  Check,
  Bot,
  Loader2,
  Play,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./SectionCard";
import { InlineInput } from "./InlineInput";
import { DataFlowDiagram } from "./DataFlowDiagram";
import type { AgentData, ToolConnectionItem, TriggerItem } from "./types";
import type { DiscoveryDocuments, SkillGraphNode, WorkflowDefinition } from "@/lib/openclaw/types";
import type { SavedAgent } from "@/hooks/use-agents-store";
import type {
  AgentImprovement,
  AgentRuntimeInput,
  AgentToolConnection,
  AgentTriggerDefinition,
} from "@/lib/agents/types";
import { buildSoulContent } from "@/lib/openclaw/agent-config";
import { sendToArchitectStreaming } from "@/lib/openclaw/api";
import {
  buildReviewRuntimeInputItems,
  buildReviewToolItems,
  buildReviewTriggerItems,
} from "@/lib/agents/operator-config-summary";
import { buildCoPilotReviewAgentSnapshot } from "@/lib/openclaw/copilot-flow";
import { applyAcceptedImprovementsToConfig } from "../../create-session-config";

interface TestChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
}

export interface ReviewAgentOutput {
  name: string;
  rules: string[];
  skills: string[];
  toolConnections: ToolConnectionItem[];
  triggers: TriggerItem[];
  improvements: AgentImprovement[];
  accessTeams: string[];
}

interface BuildReviewAgentSnapshotInput {
  name: string;
  rules: string[];
  skills: string[];
  runtimeInputs: AgentRuntimeInput[];
  triggers: TriggerItem[];
  improvements: AgentImprovement[];
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  persistedToolConnections?: AgentToolConnection[];
  persistedTriggers?: AgentTriggerDefinition[];
}

function buildDraftTriggerDefinitions(
  draftTriggers: TriggerItem[],
  persistedTriggers: AgentTriggerDefinition[] | undefined
): AgentTriggerDefinition[] {
  const definitions: AgentTriggerDefinition[] = [];

  for (const trigger of draftTriggers) {
    const title = trigger.text.trim();
    if (!title) continue;

    const persisted = persistedTriggers?.find(
      (candidate) =>
        (trigger.id && candidate.id === trigger.id) ||
        candidate.title === title,
    );

    definitions.push({
      id: trigger.id || persisted?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title,
      kind: trigger.kind || persisted?.kind || "manual",
      status: trigger.status || persisted?.status || "unsupported",
      description: persisted?.description || title,
      schedule: persisted?.schedule,
    });
  }

  return definitions;
}

export function buildReviewAgentSnapshot({
  name,
  rules,
  skills,
  runtimeInputs,
  triggers,
  improvements,
  skillGraph,
  workflow,
  persistedToolConnections,
  persistedTriggers,
}: BuildReviewAgentSnapshotInput): SavedAgent {
  const snapshotTriggers = buildDraftTriggerDefinitions(triggers, persistedTriggers);
  const selectedSkillIds =
    skillGraph?.map((node) =>
      skills.find((skill) =>
        skill.trim().toLowerCase() === (node.name || node.skill_id).trim().toLowerCase() ||
        skill.trim().toLowerCase() === node.skill_id.trim().toLowerCase(),
      )
        ? node.skill_id
        : null,
    ).filter((skillId): skillId is string => Boolean(skillId)) ?? [];

  return buildCoPilotReviewAgentSnapshot({
    name,
    description: rules[0] || `run the following skills: ${skills.join(", ")}`,
    systemName: name,
    selectedSkillIds: selectedSkillIds.length > 0 ? selectedSkillIds : skills,
    skillGraph,
    workflow,
    agentRules: rules,
    runtimeInputs,
    connectedTools: persistedToolConnections ?? [],
    triggers: snapshotTriggers,
    improvements,
  });
}

interface ReviewAgentProps {
  onBack: () => void;
  onConfirm: (output: ReviewAgentOutput) => void;
  skillGraph?: SkillGraphNode[] | null;
  workflow?: WorkflowDefinition | null;
  systemName?: string | null;
  agentRules?: string[];
  runtimeInputs?: AgentRuntimeInput[];
  toolConnections?: AgentToolConnection[];
  triggers?: AgentTriggerDefinition[];
  improvements?: AgentImprovement[];
  discoveryDocuments?: DiscoveryDocuments | null;
}

export function ReviewAgent({
  onBack,
  onConfirm,
  skillGraph,
  workflow,
  systemName,
  agentRules,
  runtimeInputs,
  toolConnections,
  triggers,
  improvements,
  discoveryDocuments,
}: ReviewAgentProps) {
  const reviewToolConnections = buildReviewToolItems(toolConnections);
  const reviewRuntimeInputs = buildReviewRuntimeInputItems(runtimeInputs);
  const reviewTriggers = buildReviewTriggerItems(triggers);
  const initialData: AgentData = {
    name: systemName || "New Agent",
    rules: agentRules && agentRules.length > 0 ? agentRules : [],
    skills: skillGraph ? skillGraph.map((n) => n.name || n.skill_id) : [],
    toolConnections: reviewToolConnections,
    triggers: reviewTriggers.length > 0
      ? reviewTriggers.map((trigger) => ({
          id: trigger.id,
          icon: trigger.kind === "schedule" ? "calendar" : "heart",
          text: trigger.text,
          kind: trigger.kind,
          status: trigger.status,
          statusLabel: trigger.statusLabel,
          detail: trigger.detail,
        }))
      : workflow
      ? workflow.steps.slice(0, 3).map((s) => ({
          icon: "calendar" as const,
          text: typeof s === "string" ? s : s.skill,
        }))
      : [],
    improvements: improvements ?? [],
    accessTeams: [],
  };
  const [data, setData] = useState<AgentData>(initialData);
  const [editing, setEditing] = useState<Partial<Record<string, boolean>>>({});
  const [draftName, setDraftName] = useState(data.name);
  const [draftRules, setDraftRules] = useState<string[]>(data.rules);
  const [draftSkills, setDraftSkills] = useState<string[]>(data.skills);
  const [draftTriggers, setDraftTriggers] = useState<TriggerItem[]>(data.triggers);
  const [draftImprovements, setDraftImprovements] = useState<AgentImprovement[]>(data.improvements);
  const [draftTeams, setDraftTeams] = useState<string[]>(data.accessTeams);
  const [newTeam, setNewTeam] = useState("");
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [testMessages, setTestMessages] = useState<TestChatMessage[]>([]);
  const [testInput, setTestInput] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [testError, setTestError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testSessionId, setTestSessionId] = useState(() => uuidv4());

  const startEdit = (s: string) => {
    if (s === "name") setDraftName(data.name);
    if (s === "rules") setDraftRules([...data.rules]);
    if (s === "skills") setDraftSkills([...data.skills]);
    if (s === "triggers") setDraftTriggers(data.triggers.map((t) => ({ ...t })));
    if (s === "improvements") setDraftImprovements(data.improvements.map((item) => ({ ...item })));
    if (s === "access") {
      setDraftTeams([...data.accessTeams]);
      setNewTeam("");
    }
    setEditing((p) => ({ ...p, [s]: true }));
  };

  const cancelEdit = (s: string) => setEditing((p) => ({ ...p, [s]: false }));

  const saveEdit = (s: string) => {
    if (s === "name") setData((d) => ({ ...d, name: draftName.trim() || d.name }));
    if (s === "rules") setData((d) => ({ ...d, rules: draftRules.filter(Boolean) }));
    if (s === "skills") setData((d) => ({ ...d, skills: draftSkills.filter(Boolean) }));
    if (s === "triggers")
      setData((d) => ({ ...d, triggers: draftTriggers.filter((t) => t.text.trim()) }));
    if (s === "improvements") {
      setData((d) => {
        const projected = applyAcceptedImprovementsToConfig({
          toolConnections: (toolConnections ?? []).map((tool) => ({ ...tool })),
          improvements: draftImprovements,
        });
        const reviewTools = buildReviewToolItems(projected.toolConnections);

        return {
          ...d,
          improvements: draftImprovements,
          toolConnections: reviewTools,
        };
      });
    }
    if (s === "access") setData((d) => ({ ...d, accessTeams: draftTeams.filter(Boolean) }));
    cancelEdit(s);
  };

  const addTeam = () => {
    if (newTeam.trim()) {
      setDraftTeams((p) => [...p, newTeam.trim()]);
      setNewTeam("");
    }
  };

  const reviewAgentSnapshot = buildReviewAgentSnapshot({
    name: data.name,
    rules: data.rules,
    skills: data.skills,
    runtimeInputs: runtimeInputs ?? [],
    triggers: data.triggers,
    improvements: data.improvements,
    skillGraph,
    workflow,
    persistedToolConnections: toolConnections,
    persistedTriggers: triggers,
  });
  const testAgentLabel = reviewAgentSnapshot.name || "New Agent";

  const closeTestPanel = () => {
    setTestPanelOpen(false);
    setTestMessages([]);
    setTestInput("");
    setTestStatus("");
    setTestError(null);
    setIsTesting(false);
    setTestSessionId(uuidv4());
  };

  const handleTestMessage = async () => {
    const message = testInput.trim();
    if (!message || isTesting) return;

    setTestMessages((current) => [
      ...current,
      { id: uuidv4(), role: "user", content: message },
    ]);
    setTestInput("");
    setIsTesting(true);
    setTestError(null);
    setTestStatus("Connecting to test agent...");

    try {
      const response = await sendToArchitectStreaming(
        testSessionId,
        message,
        {
          onStatus: (_phase, statusMessage) => {
            setTestStatus(statusMessage);
          },
        },
        {
          mode: "test",
          soulOverride: buildSoulContent(reviewAgentSnapshot),
        }
      );

      setTestMessages((current) => [
        ...current,
        {
          id: uuidv4(),
          role: "agent",
          content:
            response.content ||
            ("error" in response && typeof response.error === "string"
              ? response.error
              : "No response received."),
        },
      ]);
      setTestStatus("");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to run test chat.";
      setTestError(messageText);
      setTestMessages((current) => [
        ...current,
        {
          id: uuidv4(),
          role: "agent",
          content: `Test chat failed: ${messageText}`,
        },
      ]);
      setTestStatus("");
      setTestSessionId(uuidv4());
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--background)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 md:px-8 py-4 shrink-0 border-b border-[var(--border-default)] bg-[var(--card-color)]">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg border border-[var(--border-stroke)] hover:bg-[var(--color-light)] transition-colors cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
        <h1 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
          Review your agent
        </h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* Agent Name */}
          <div
            className={`bg-[var(--card-color)] border rounded-2xl px-6 py-4 transition-all duration-200 ${
              editing.name
                ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)]"
                : "border-[var(--border-stroke)]"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5 flex-1 min-w-0 mr-3">
                <div className="w-[34px] h-[34px] shrink-0">
                  <Image
                    src="/assets/logos/favicon.svg"
                    alt="Agent logo"
                    width={34}
                    height={34}
                  />
                </div>
                {editing.name ? (
                  <input
                    autoFocus
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="flex-1 text-xl font-satoshi-bold text-[var(--text-primary)] bg-transparent border-b-2 border-[var(--primary)] outline-none"
                  />
                ) : (
                  <span className="text-xl font-satoshi-bold text-[var(--text-primary)] truncate">
                    {data.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {editing.name ? (
                  <>
                    <button
                      onClick={() => cancelEdit("name")}
                      className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--border-muted)] text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors"
                    >
                      <X className="h-[15px] w-[15px]" />
                    </button>
                    <button
                      onClick={() => saveEdit("name")}
                      className="p-1.5 rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors"
                    >
                      <Check className="h-[15px] w-[15px]" />
                    </button>
                  </>
                ) : (
                  <>
                    <button className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                      <SlidersHorizontal className="h-[15px] w-[15px]" />
                    </button>
                    <button
                      onClick={() => startEdit("name")}
                      className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors"
                    >
                      <Pencil className="h-[15px] w-[15px]" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Rules */}
          <SectionCard
            title="Rules"
            isEditing={!!editing.rules}
            onEdit={() => startEdit("rules")}
            onSave={() => saveEdit("rules")}
            onCancel={() => cancelEdit("rules")}
          >
            {editing.rules ? (
              <div className="space-y-3">
                {draftRules.map((rule, i) => (
                  <InlineInput
                    key={i}
                    value={rule}
                    autoFocus={i === draftRules.length - 1 && rule === ""}
                    onChange={(v) =>
                      setDraftRules((p) => p.map((r, idx) => (idx === i ? v : r)))
                    }
                    onDelete={() => setDraftRules((p) => p.filter((_, idx) => idx !== i))}
                    placeholder="Enter rule..."
                  />
                ))}
                <button
                  onClick={() => setDraftRules((p) => [...p, ""])}
                  className="flex items-center gap-1.5 text-xs font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors pl-4 mt-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add rule
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.rules.length === 0 ? (
                  <li className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                    No rules defined yet — click edit to add.
                  </li>
                ) : data.rules.map((rule, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm font-satoshi-medium text-[var(--text-secondary)]"
                  >
                    <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                    {rule}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Approved requirements">
            {!discoveryDocuments ? (
              <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                No approved discovery documents were saved yet.
              </p>
            ) : (
              <div className="space-y-4">
                {(["prd", "trd"] as const).map((docType) => {
                  const document = discoveryDocuments[docType];
                  return (
                    <div
                      key={docType}
                      className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                          {document.title}
                        </p>
                        <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {docType.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-3 space-y-3">
                        {document.sections.map((section) => (
                          <div key={`${docType}-${section.heading}`}>
                            <p className="text-xs font-satoshi-bold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                              {section.heading}
                            </p>
                            <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)] whitespace-pre-wrap">
                              {section.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Improvements"
            isEditing={!!editing.improvements}
            onEdit={() => startEdit("improvements")}
            onSave={() => saveEdit("improvements")}
            onCancel={() => cancelEdit("improvements")}
          >
            {editing.improvements ? (
              <div className="space-y-3">
                {draftImprovements.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                    No builder improvements yet.
                  </p>
                ) : draftImprovements.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{item.title}</p>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{item.summary}</p>
                    <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{item.rationale}</p>
                    <div className="mt-3 flex items-center gap-2">
                      {(["pending", "accepted", "dismissed"] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => setDraftImprovements((current) => current.map((entry) => (
                            entry.id === item.id ? { ...entry, status } : entry
                          )))}
                          className={`rounded-full px-3 py-1 text-xs font-satoshi-medium transition-colors ${
                            item.status === status
                              ? "bg-[var(--primary)] text-white"
                              : "border border-[var(--border-stroke)] text-[var(--text-secondary)]"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {data.improvements.length === 0 ? (
                  <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                    No builder improvements recorded yet.
                  </p>
                ) : data.improvements.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">{item.title}</p>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">{item.summary}</p>
                    <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">{item.rationale}</p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Data Flow (view-only) */}
          <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-satoshi-bold text-[var(--text-primary)]">
                Data flow
              </span>
              <div className="flex items-center gap-1.5">
                <button className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                  <SlidersHorizontal className="h-[15px] w-[15px]" />
                </button>
                <button className="p-1.5 rounded-lg bg-[rgba(0,10,36,0.03)] hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors">
                  <Pencil className="h-[15px] w-[15px]" />
                </button>
              </div>
            </div>
            <div className="border-t border-[var(--border-default)] mb-4" />
            <DataFlowDiagram nodes={skillGraph ?? undefined} />
          </div>

          {/* Skills */}
          <SectionCard
            title="Skills"
            isEditing={!!editing.skills}
            onEdit={() => startEdit("skills")}
            onSave={() => saveEdit("skills")}
            onCancel={() => cancelEdit("skills")}
          >
            {editing.skills ? (
              <div className="space-y-3">
                {draftSkills.map((skill, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <FileJson className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0" />
                    <input
                      type="text"
                      value={skill}
                      autoFocus={i === draftSkills.length - 1 && skill === ""}
                      onChange={(e) =>
                        setDraftSkills((p) =>
                          p.map((s, idx) => (idx === i ? e.target.value : s))
                        )
                      }
                      className="flex-1 py-0.5 text-sm font-satoshi-medium text-[var(--text-secondary)] bg-transparent border-b border-[var(--border-default)] outline-none focus:border-[var(--primary)] transition-colors"
                    />
                    <button
                      onClick={() => setDraftSkills((p) => p.filter((_, idx) => idx !== i))}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] transition-all shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setDraftSkills((p) => [...p, ""])}
                  className="flex items-center gap-1.5 text-xs font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors pl-7 mt-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add skill
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.skills.map((skill, i) => (
                  <li key={i} className="flex items-center gap-2 py-0.5">
                    <FileJson className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0" />
                    <span className="text-sm font-satoshi-medium text-[var(--text-secondary)] flex-1">
                      {skill}
                    </span>
                    <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-satoshi-bold text-[var(--text-primary)]">
                Runtime inputs
              </span>
              <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Saved config
              </span>
            </div>
            <div className="border-t border-[var(--border-default)] mb-4" />
            {reviewRuntimeInputs.length === 0 ? (
              <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                No runtime inputs required yet.
              </p>
            ) : (
              <div className="space-y-3">
                {reviewRuntimeInputs.map((input) => (
                  <div
                    key={input.key}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                          {input.label}
                        </p>
                        <p className="mt-1 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                          {input.key}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {input.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                      {input.detail}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-satoshi-bold text-[var(--text-primary)]">
                Tool connections
              </span>
              <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                Saved config
              </span>
            </div>
            <div className="border-t border-[var(--border-default)] mb-4" />
            {data.toolConnections.length === 0 ? (
              <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic">
                No persisted tool connections yet.
              </p>
            ) : (
              <div className="space-y-3">
                {data.toolConnections.map((tool) => (
                  <div
                    key={tool.id}
                    className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                          {tool.name}
                        </p>
                        <p className="mt-1 text-sm font-satoshi-regular text-[var(--text-secondary)]">
                          {tool.description}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {tool.statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                      {tool.detail}
                    </p>
                    {tool.planNotes && tool.planNotes.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {tool.planNotes.map((note) => (
                          <li
                            key={`${tool.id}-${note}`}
                            className="text-xs font-satoshi-regular text-[var(--text-secondary)]"
                          >
                            {note}
                          </li>
                        ))}
                      </ul>
                    )}
                    {tool.sources && tool.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tool.sources.slice(0, 2).map((source) => (
                          <a
                            key={`${tool.id}-${source.url}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-satoshi-medium text-[var(--primary)] hover:underline"
                          >
                            {source.title}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Triggers */}
          <SectionCard
            title="Triggers"
            isEditing={!!editing.triggers}
            onEdit={() => startEdit("triggers")}
            onSave={() => saveEdit("triggers")}
            onCancel={() => cancelEdit("triggers")}
          >
            {data.triggers.length === 0 && !editing.triggers && (
              <p className="text-sm font-satoshi-regular text-[var(--text-tertiary)] italic mb-1">
                No triggers set — click edit to add.
              </p>
            )}
            {editing.triggers ? (
              <div className="space-y-3">
                {draftTriggers.map((trigger, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <button
                      title="Toggle icon"
                      onClick={() =>
                        setDraftTriggers((p) =>
                          p.map((t, idx) =>
                            idx === i
                              ? { ...t, icon: t.icon === "calendar" ? "heart" : "calendar" }
                              : t
                          )
                        )
                      }
                      className="shrink-0 hover:opacity-70 transition-opacity"
                    >
                      {trigger.icon === "calendar" ? (
                        <Calendar className="h-[18px] w-[18px] text-[var(--text-tertiary)]" />
                      ) : (
                        <Heart className="h-4 w-4 text-[var(--text-tertiary)]" />
                      )}
                    </button>
                    <input
                      type="text"
                      value={trigger.text}
                      autoFocus={i === draftTriggers.length - 1 && trigger.text === ""}
                      onChange={(e) =>
                        setDraftTriggers((p) =>
                          p.map((t, idx) => (idx === i ? { ...t, text: e.target.value } : t))
                        )
                      }
                      className="flex-1 py-0.5 text-sm font-satoshi-medium text-[var(--text-secondary)] bg-transparent border-b border-[var(--border-default)] outline-none focus:border-[var(--primary)] transition-colors"
                    />
                    <button
                      onClick={() =>
                        setDraftTriggers((p) => p.filter((_, idx) => idx !== i))
                      }
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--error)] transition-all shrink-0"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setDraftTriggers((p) => [...p, { icon: "calendar", text: "" }])
                  }
                  className="flex items-center gap-1.5 text-xs font-satoshi-medium text-[var(--primary)] hover:text-[var(--primary-hover)] transition-colors pl-7 mt-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add trigger
                </button>
              </div>
            ) : (
              <ul className="space-y-3">
                {data.triggers.map((trigger, i) => (
                  <li key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--background-muted)] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 py-0.5">
                        {trigger.icon === "calendar" ? (
                          <Calendar className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0" />
                        ) : (
                          <Heart className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                        )}
                        <span className="text-sm font-satoshi-medium text-[var(--text-secondary)]">
                          {trigger.text}
                        </span>
                      </div>
                      {trigger.statusLabel && (
                        <span className="rounded-full border border-[var(--border-stroke)] px-2.5 py-1 text-[10px] font-satoshi-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                          {trigger.statusLabel}
                        </span>
                      )}
                    </div>
                    {trigger.detail && (
                      <p className="mt-2 text-xs font-satoshi-regular text-[var(--text-tertiary)]">
                        {trigger.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Access */}
          <SectionCard
            title="Access"
            isEditing={!!editing.access}
            onEdit={() => startEdit("access")}
            onSave={() => saveEdit("access")}
            onCancel={() => cancelEdit("access")}
          >
            {editing.access ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <PersonStanding className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-sm font-satoshi-medium text-[var(--text-secondary)]">
                    Specific teams
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draftTeams.map((team, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-satoshi-regular bg-[var(--color-light-secondary)] border border-[var(--border-stroke)] text-[var(--text-secondary)]"
                    >
                      {team}
                      <button
                        onClick={() =>
                          setDraftTeams((p) => p.filter((_, idx) => idx !== i))
                        }
                        className="text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors ml-0.5"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={newTeam}
                    onChange={(e) => setNewTeam(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTeam()}
                    placeholder="Add team and press Enter…"
                    className="flex-1 h-8 px-3 text-sm font-satoshi-regular text-[var(--text-primary)] bg-[var(--background-muted)] border border-[var(--border-default)] rounded-lg outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
                  />
                  <button
                    onClick={addTeam}
                    className="h-8 w-8 flex items-center justify-center rounded-lg bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 flex-wrap">
                <PersonStanding className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0 mt-0.5" />
                <span className="text-sm font-satoshi-medium text-[var(--text-secondary)] mr-1">
                  {data.accessTeams.length === 0 ? "All members" : "Specific teams"}
                </span>
                {data.accessTeams.map((team) => (
                  <span
                    key={team}
                    className="px-2 py-1 rounded-md text-xs font-satoshi-regular bg-[var(--color-light-secondary)] border border-[var(--border-stroke)] text-[var(--text-secondary)]"
                  >
                    {team}
                  </span>
                ))}
              </div>
            )}
          </SectionCard>

          <div className="h-2" />

          <div className="bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-2xl px-6 py-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[var(--text-primary)]">
                  <Bot className="h-4 w-4" />
                  <span className="text-base font-satoshi-bold">Test Agent</span>
                </div>
                <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                  Run a quick review chat as {testAgentLabel} before deployment. Test messages use an isolated builder session and do not change the main architect history.
                </p>
              </div>
              <Button
                variant={testPanelOpen ? "tertiary" : "secondary"}
                className="h-10 px-4"
                onClick={() => {
                  if (testPanelOpen) {
                    closeTestPanel();
                    return;
                  }

                  setTestPanelOpen(true);
                }}
              >
                <Play className="h-4 w-4" />
                {testPanelOpen ? "Close Test Panel" : "Test Agent"}
              </Button>
            </div>

            {testPanelOpen && (
              <div className="mt-5 border-t border-[var(--border-default)] pt-5 space-y-4">
                <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--background-muted)] p-4">
                  <p className="text-xs font-satoshi-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                    Testing as {testAgentLabel}
                  </p>
                  <div className="mt-3 space-y-3 max-h-72 overflow-y-auto">
                    {testMessages.length === 0 ? (
                      <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                        Ask a sample question to verify the current agent draft before you deploy it.
                      </p>
                    ) : (
                      testMessages.map((entry) => (
                        <div
                          key={entry.id}
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            entry.role === "user"
                              ? "bg-[var(--primary)] text-white"
                              : "bg-[var(--card-color)] text-[var(--text-primary)] border border-[var(--border-default)]"
                          }`}
                        >
                          {entry.content}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="review-test-input"
                    className="text-sm font-satoshi-medium text-[var(--text-primary)]"
                  >
                    Test prompt
                  </label>
                  <textarea
                    id="review-test-input"
                    value={testInput}
                    onChange={(event) => setTestInput(event.target.value)}
                    placeholder="Ask what this agent can do, or give it a sample task."
                    className="min-h-24 w-full rounded-2xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--primary)]"
                  />
                </div>

                {(testStatus || testError) && (
                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                    {testStatus && (
                      <div className="flex items-center gap-2">
                        {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                        <span>{testStatus}</span>
                      </div>
                    )}
                    {!testStatus && testError && <span>{testError}</span>}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3">
                  <Button
                    variant="tertiary"
                    className="h-10 px-4"
                    onClick={closeTestPanel}
                  >
                    Reset
                  </Button>
                  <Button
                    variant="primary"
                    className="h-10 px-4"
                    onClick={handleTestMessage}
                    disabled={isTesting || !testInput.trim()}
                  >
                    {isTesting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send Test Message
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-end gap-3">
          <Button variant="tertiary" className="h-10 px-6" onClick={onBack}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="h-10 px-6 gap-1.5"
            disabled={!data.name.trim()}
            onClick={() => onConfirm(data)}
          >
            Confirm <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
