"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { Brain, Search, Tag, X } from "lucide-react";
import { api, type Memory } from "@/lib/api";

const MEMORY_TYPES = ["pattern", "pitfall", "preference", "decision", "debug", "refinement", "score"];

const TYPE_COLORS: Record<string, string> = {
  pattern: "bg-[#3b82f6]/10 text-[#3b82f6]",
  pitfall: "bg-[#ef4444]/10 text-[#ef4444]",
  preference: "bg-[var(--primary)]/10 text-[var(--primary)]",
  decision: "bg-[#f59e0b]/10 text-[#f59e0b]",
  debug: "bg-[#22c55e]/10 text-[#22c55e]",
  refinement: "bg-[var(--secondary)]/10 text-[var(--secondary)]",
  score: "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]",
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [total, setTotal] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [stats, setStats] = useState<{ byType: Record<string, number>; byAgent: Record<string, number> } | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Memory[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params: Record<string, string> = { limit: "30" };
    if (typeFilter) params.type = typeFilter;
    if (agentFilter) params.agent = agentFilter;
    api.memories.list(params).then((r) => { setMemories(r.items); setTotal(r.total); });
  }, [typeFilter, agentFilter]);

  useEffect(() => {
    api.dashboard().then((s) => setStats({ byType: s.memories.byType, byAgent: s.memories.byAgent }));
  }, []);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setSearchActive(false);
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }
    setIsSearching(true);
    api.memories.search(q)
      .then((r) => {
        setSearchResults(r.items);
        setSearchTotal(r.total);
        setSearchActive(true);
      })
      .catch(console.error)
      .finally(() => setIsSearching(false));
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 500);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchActive(false);
    setSearchResults([]);
    setSearchTotal(0);
  };

  const displayedMemories = searchActive ? searchResults : memories;
  const displayedTotal = searchActive ? searchTotal : total;

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--text-primary)]">Memory</h1>
      <p className="text-xs text-[var(--text-tertiary)] mt-1">
        {searchActive
          ? `${searchTotal} results for "${searchQuery}"`
          : `${total} memories stored`}
      </p>

      {/* Search Bar */}
      <div className="mt-4 relative">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] focus-within:border-[var(--primary)] transition-colors">
          <Search className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" />
          <input
            type="text"
            placeholder="Search memories semantically..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
          />
          {isSearching && (
            <div className="w-3.5 h-3.5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin shrink-0" />
          )}
          {searchActive && !isSearching && (
            <button onClick={clearSearch} className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--error)] transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Only show filters when not in search mode */}
      {!searchActive && (
        <>
          {/* Type Distribution */}
          {stats && Object.keys(stats.byType).length > 0 && (
            <div className="flex gap-2 mt-4 flex-wrap">
              {Object.entries(stats.byType).map(([type, count]) => (
                <button
                  key={type}
                  onClick={() => setTypeFilter(typeFilter === type ? "" : type)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                    typeFilter === type ? "ring-2 ring-[var(--primary)]/50" : ""
                  } ${TYPE_COLORS[type] || TYPE_COLORS.score}`}
                >
                  {type} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 mt-4">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-xs text-[var(--text-secondary)]"
            >
              <option value="">All types</option>
              {MEMORY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="text"
              placeholder="Filter by agent..."
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--card-color)] text-xs text-[var(--text-secondary)] w-48"
            />
          </div>
        </>
      )}

      {/* Memory List */}
      <div className="mt-4 space-y-2">
        {displayedMemories.length === 0 ? (
          <div className="text-center py-12">
            <Brain className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-tertiary)]">
              {searchActive ? "No results found" : "No memories yet"}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {searchActive ? "Try a different search query" : "Hermes stores learnings as it works"}
            </p>
          </div>
        ) : displayedMemories.map((mem) => (
          <div key={mem.id} className="animate-fadeIn bg-[var(--card-color)] rounded-xl border border-[var(--border-default)] p-4">
            <div className="flex items-start gap-3">
              <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium ${TYPE_COLORS[mem.type] || TYPE_COLORS.score}`}>
                {mem.type}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)]">{mem.text}</p>
                <div className="flex items-center gap-3 mt-2">
                  <span className="text-[10px] font-medium text-[var(--primary)]">{mem.agent}</span>
                  {mem.tags && (
                    <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)]">
                      <Tag className="h-2.5 w-2.5" />
                      {mem.tags}
                    </span>
                  )}
                  <span className="text-[10px] text-[var(--text-tertiary)] ml-auto">
                    {new Date(mem.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
