"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Plus, Search, Loader2 } from "lucide-react";
import { AGENT_TEMPLATES, type AgentTemplate } from "../../_config/wizard-templates";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ── Backend template types (kept local — don't modify AgentTemplate) ── */

export interface BackendTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  skillCount: number;
  tags: string[];
}

export interface BackendTemplateFull extends BackendTemplate {
  architecturePlan: {
    soulContent: string;
    skills: Array<{ id: string; name: string; skill_md: string }>;
    tools: string[];
    triggers: string[];
    rules: string[];
  };
}

/* ── Helpers ── */

function warmthMouseHandler(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
  e.currentTarget.style.setProperty("--mouse-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

/** Convert a BackendTemplate to the AgentTemplate shape for the wizard context */
function toAgentTemplate(bt: BackendTemplate): AgentTemplate {
  return {
    id: bt.id,
    name: bt.name,
    emoji: bt.icon,
    tagline: bt.description,
    description: bt.description,
    category: bt.category,
    skills: [],
    tools: [],
    tone: "professional",
    triggerIds: [],
    rules: [],
  };
}

/* ── Props ── */

interface TemplatePickerProps {
  selectedId: string | null;
  onSelect: (template: AgentTemplate, architecturePlan?: BackendTemplateFull["architecturePlan"]) => void;
  onBlankSlate: () => void;
}

export function TemplatePicker({ selectedId, onSelect, onBlankSlate }: TemplatePickerProps) {
  const [backendTemplates, setBackendTemplates] = useState<BackendTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  // Fetch templates + categories from backend, fall back to hardcoded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [tplRes, catRes] = await Promise.all([
          fetch(`${API_BASE}/api/templates`),
          fetch(`${API_BASE}/api/templates/categories`),
        ]);
        if (!tplRes.ok) throw new Error("templates fetch failed");
        const tpls: BackendTemplate[] = await tplRes.json();
        const cats: string[] = catRes.ok ? await catRes.json() : [];
        if (!cancelled) {
          setBackendTemplates(tpls);
          setCategories(cats);
          setUsingFallback(false);
        }
      } catch {
        if (!cancelled) setUsingFallback(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Derive display list
  const displayTemplates = useMemo(() => {
    if (usingFallback) {
      return AGENT_TEMPLATES.filter((t) => {
        const q = search.toLowerCase();
        const matchSearch = !q || t.name.toLowerCase().includes(q) || t.tagline.toLowerCase().includes(q);
        const matchCat = activeCategory === "All" || t.category === activeCategory;
        return matchSearch && matchCat;
      }).map((t) => ({ id: t.id, name: t.name, icon: t.emoji, description: t.tagline, category: t.category, _original: t }));
    }
    return backendTemplates
      .filter((t) => {
        const q = search.toLowerCase();
        const matchSearch = !q || t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q));
        const matchCat = activeCategory === "All" || t.category === activeCategory;
        return matchSearch && matchCat;
      })
      .map((t) => ({ id: t.id, name: t.name, icon: t.icon, description: t.description, category: t.category, _backend: t }));
  }, [usingFallback, backendTemplates, search, activeCategory]);

  const allCategories = useMemo(() => {
    if (usingFallback) {
      const cats = [...new Set(AGENT_TEMPLATES.map((t) => t.category))];
      return ["All", ...cats];
    }
    return ["All", ...categories];
  }, [usingFallback, categories]);

  // When a backend template is selected, fetch full detail for architecturePlan
  async function handleSelect(item: (typeof displayTemplates)[number]) {
    if (usingFallback && "_original" in item) {
      onSelect((item as any)._original as AgentTemplate);
      return;
    }
    // Optimistically select with basic data
    const bt = (item as any)._backend as BackendTemplate;
    const agentTpl = toAgentTemplate(bt);
    try {
      const res = await fetch(`${API_BASE}/api/templates/${bt.id}`);
      if (res.ok) {
        const full: BackendTemplateFull = await res.json();
        // Enrich the AgentTemplate with data from the full response
        agentTpl.skills = full.architecturePlan.skills.map((s) => s.id);
        agentTpl.tools = full.architecturePlan.tools;
        agentTpl.triggerIds = full.architecturePlan.triggers;
        agentTpl.rules = full.architecturePlan.rules;
        onSelect(agentTpl, full.architecturePlan);
        return;
      }
    } catch { /* fall through */ }
    onSelect(agentTpl);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div>
      {/* Search + category filters */}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full h-9 pl-9 pr-4 rounded-lg border border-[var(--border-stroke)] bg-[var(--card-color)] text-sm font-satoshi-regular text-[var(--text-primary)] outline-none focus:border-[var(--primary)] transition-colors placeholder:text-[var(--text-placeholder)]"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-satoshi-medium transition-colors ${
                activeCategory === cat
                  ? "bg-[var(--primary)] text-white"
                  : "bg-[var(--background)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {displayTemplates.map((t) => {
          const isSelected = selectedId === t.id;
          return (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              onMouseMove={warmthMouseHandler}
              className={`warmth-hover text-left rounded-xl border-2 p-4 transition-all cursor-pointer group ${
                isSelected
                  ? "border-[var(--primary)] shadow-[0_0_0_3px_rgba(174,0,208,0.08)] bg-[var(--card-color)]"
                  : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
              }`}
            >
              <div className="text-2xl mb-2">{t.icon}</div>
              <p className={`text-sm font-satoshi-bold mb-1 ${
                isSelected ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
              }`}>
                {t.name}
              </p>
              <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-2">
                {t.description}
              </p>
              <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-satoshi-medium bg-[var(--background)] border border-[var(--border-default)] text-[var(--text-tertiary)]">
                {t.category}
              </span>
            </button>
          );
        })}

        {/* Blank slate card */}
        <button
          onClick={onBlankSlate}
          onMouseMove={warmthMouseHandler}
          className={`warmth-hover text-left rounded-xl border-2 border-dashed p-4 transition-all cursor-pointer group ${
            selectedId === null
              ? "border-[var(--primary)] bg-[var(--primary)]/5"
              : "border-[var(--border-stroke)] bg-[var(--card-color)] hover:border-[var(--border-default)]"
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--background)] border border-[var(--border-default)] flex items-center justify-center mb-2">
            <Plus className="h-4 w-4 text-[var(--text-tertiary)]" />
          </div>
          <p className={`text-sm font-satoshi-bold mb-1 ${
            selectedId === null ? "text-[var(--primary)]" : "text-[var(--text-primary)]"
          }`}>
            Start from scratch
          </p>
          <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] line-clamp-2">
            Build a custom agent with no pre-filled defaults
          </p>
        </button>
      </div>

      {displayTemplates.length === 0 && (
        <p className="text-center text-sm font-satoshi-regular text-[var(--text-tertiary)] py-6">
          No templates match your search.
        </p>
      )}
    </div>
  );
}
