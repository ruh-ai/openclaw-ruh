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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./SectionCard";
import { InlineInput } from "./InlineInput";
import { DataFlowDiagram } from "./DataFlowDiagram";
import { INITIAL_AGENT_DATA } from "./mockData";
import type { AgentData, TriggerItem } from "./types";

interface ReviewAgentProps {
  onBack: () => void;
  onConfirm: () => void;
}

export function ReviewAgent({ onBack, onConfirm }: ReviewAgentProps) {
  const [data, setData] = useState<AgentData>(INITIAL_AGENT_DATA);
  const [editing, setEditing] = useState<Partial<Record<string, boolean>>>({});
  const [draftName, setDraftName] = useState(data.name);
  const [draftRules, setDraftRules] = useState<string[]>(data.rules);
  const [draftSkills, setDraftSkills] = useState<string[]>(data.skills);
  const [draftTriggers, setDraftTriggers] = useState<TriggerItem[]>(data.triggers);
  const [draftTeams, setDraftTeams] = useState<string[]>(data.accessTeams);
  const [newTeam, setNewTeam] = useState("");

  const startEdit = (s: string) => {
    if (s === "name") setDraftName(data.name);
    if (s === "rules") setDraftRules([...data.rules]);
    if (s === "skills") setDraftSkills([...data.skills]);
    if (s === "triggers") setDraftTriggers(data.triggers.map((t) => ({ ...t })));
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
    if (s === "access") setData((d) => ({ ...d, accessTeams: draftTeams.filter(Boolean) }));
    cancelEdit(s);
  };

  const addTeam = () => {
    if (newTeam.trim()) {
      setDraftTeams((p) => [...p, newTeam.trim()]);
      setNewTeam("");
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
                {data.rules.map((rule, i) => (
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
            <DataFlowDiagram />
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

          {/* Triggers */}
          <SectionCard
            title="Triggers"
            isEditing={!!editing.triggers}
            onEdit={() => startEdit("triggers")}
            onSave={() => saveEdit("triggers")}
            onCancel={() => cancelEdit("triggers")}
          >
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
                  <li key={i} className="flex items-center gap-2 py-0.5">
                    {trigger.icon === "calendar" ? (
                      <Calendar className="h-[18px] w-[18px] text-[var(--text-tertiary)] shrink-0" />
                    ) : (
                      <Heart className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
                    )}
                    <span className="text-sm font-satoshi-medium text-[var(--text-secondary)]">
                      {trigger.text}
                    </span>
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
                  Specific teams
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
            onClick={onConfirm}
          >
            Confirm <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
