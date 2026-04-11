"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  Package,
  Plus,
  Save,
  Send,
  Star,
  Store,
  X,
  XCircle,
} from "lucide-react";
import type { SavedAgent } from "@/hooks/use-agents-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchBackendWithAuth } from "@/lib/auth/backend-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MARKETPLACE_URL = process.env.NEXT_PUBLIC_MARKETPLACE_URL || "";

// ─── Types ────────────────────────────────────────────────────────────────────

type ListingStatus = "draft" | "pending_review" | "published" | "rejected" | "archived";

interface MarketplaceListing {
  id: string;
  agentId: string;
  publisherId: string;
  ownerOrgId: string | null;
  title: string;
  slug: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  iconUrl: string | null;
  screenshots: string[];
  version: string;
  status: ListingStatus;
  reviewNotes: string | null;
  repoUrl: string | null;
  installCount: number;
  avgRating: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { value: "general", label: "General" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
  { value: "support", label: "Support" },
  { value: "engineering", label: "Engineering" },
  { value: "data", label: "Data" },
  { value: "finance", label: "Finance" },
  { value: "hr", label: "HR" },
  { value: "operations", label: "Operations" },
  { value: "custom", label: "Custom" },
] as const;

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusLabel(s: ListingStatus): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "pending_review":
      return "Pending Review";
    case "published":
      return "Published";
    case "rejected":
      return "Rejected";
    case "archived":
      return "Archived";
  }
}

function statusColor(s: ListingStatus): string {
  switch (s) {
    case "draft":
      return "bg-[var(--text-tertiary)]/15 text-[var(--text-secondary)]";
    case "pending_review":
      return "bg-[#F59E0B]/15 text-[#92400E]";
    case "published":
      return "bg-[var(--success)]/15 text-[var(--success)]";
    case "rejected":
      return "bg-[var(--error)]/15 text-[var(--error)]";
    case "archived":
      return "bg-[var(--text-tertiary)]/10 text-[var(--text-tertiary)]";
  }
}

function statusIcon(s: ListingStatus) {
  switch (s) {
    case "draft":
      return Package;
    case "pending_review":
      return Clock;
    case "published":
      return CheckCircle2;
    case "rejected":
      return XCircle;
    case "archived":
      return Package;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TabMarketplaceProps {
  agent: SavedAgent;
}

export function TabMarketplace({ agent }: TabMarketplaceProps) {
  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state — kept separate from listing so edits don't overwrite until save
  const [form, setForm] = useState({
    title: "",
    summary: "",
    description: "",
    category: "general",
    tags: [] as string[],
    iconUrl: "",
    version: "1.0.0",
  });
  const [tagInput, setTagInput] = useState("");

  // Track whether form has unsaved changes
  const isDirty = useMemo(() => {
    if (!listing) return false;
    return (
      form.title !== listing.title ||
      form.summary !== listing.summary ||
      form.description !== listing.description ||
      form.category !== listing.category ||
      form.iconUrl !== (listing.iconUrl || "") ||
      form.version !== listing.version ||
      JSON.stringify(form.tags) !== JSON.stringify(listing.tags)
    );
  }, [form, listing]);

  // ── Fetch listing ─────────────────────────────────────────────────────────

  const fetchListing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/marketplace/my/listings`);
      if (!res.ok) throw new Error("Failed to fetch listings");
      const data = await res.json();
      const items: MarketplaceListing[] = data.items || [];
      const match = items.find((l) => l.agentId === agent.id);
      if (match) {
        setListing(match);
        setForm({
          title: match.title,
          summary: match.summary,
          description: match.description,
          category: match.category,
          tags: match.tags || [],
          iconUrl: match.iconUrl || "",
          version: match.version,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load listing");
    } finally {
      setLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  // ── Create listing ────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/marketplace/listings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          title: agent.name || "Untitled Agent",
          summary: agent.description || "",
          description: agent.description || "",
          category: "general",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create listing");
      }
      setSuccess("Listing created as draft");
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create listing");
    } finally {
      setCreating(false);
    }
  };

  // ── Save changes ──────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!listing) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/marketplace/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          summary: form.summary,
          description: form.description,
          category: form.category,
          tags: form.tags,
          iconUrl: form.iconUrl || null,
          version: form.version,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to save changes");
      }
      const updated = await res.json();
      setListing(updated);
      setSuccess("Changes saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // ── Publish now (auto-publish) ────────────────────────────────────────────

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchBackendWithAuth(`${API_BASE}/api/marketplace/listings/auto-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          title: form.title || agent.name || "Untitled Agent",
          summary: form.summary || agent.description || "",
          description: form.description || agent.description || "",
          category: form.category || "general",
          tags: form.tags,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to publish");
      }
      setSuccess("Agent published to marketplace");
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing(false);
    }
  };

  // ── Submit for review ─────────────────────────────────────────────────────

  const handleSubmitForReview = async () => {
    if (!listing) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetchBackendWithAuth(
        `${API_BASE}/api/marketplace/listings/${listing.id}/submit`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit for review");
      }
      setSuccess("Listing submitted for review");
      await fetchListing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Tag management ────────────────────────────────────────────────────────

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !form.tags.includes(tag)) {
      setForm((f) => ({ ...f, tags: [...f.tags, tag] }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  // ── Clear notifications after 4s ──────────────────────────────────────────

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(t);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 6000);
    return () => clearTimeout(t);
  }, [error]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" />
        <span className="ml-3 text-sm text-[var(--text-tertiary)]">Loading marketplace listing...</span>
      </div>
    );
  }

  // ── Empty state — no listing yet ──────────────────────────────────────────

  if (!listing) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="flex flex-col items-center gap-6 max-w-md text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--primary)]/10">
            <Store className="h-10 w-10 text-[var(--primary)]" />
          </div>
          <div>
            <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
              List on Marketplace
            </h2>
            <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed">
              Publish <span className="font-satoshi-bold text-[var(--text-secondary)]">{agent.name}</span> to
              the Ruh AI Marketplace so customers can discover, install, and use your agent.
            </p>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-2.5 text-xs text-[var(--error)]">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
          <Button onClick={handleCreate} disabled={creating} variant="primary" size="lg">
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {creating ? "Creating..." : "Create Listing"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Main listing editor + preview ─────────────────────────────────────────

  const StatusIcon = statusIcon(listing.status);
  const canEdit = listing.status === "draft" || listing.status === "rejected";
  const canPublish = listing.status === "draft" || listing.status === "rejected";
  const canSubmit = listing.status === "draft" || listing.status === "rejected";
  const storeUrl = MARKETPLACE_URL
    ? `${MARKETPLACE_URL}/marketplace/${listing.slug}`
    : null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      {/* ── Notification banners ── */}
      {success && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/5 px-4 py-2.5 text-xs font-satoshi-bold text-[var(--success)]">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {success}
        </div>
      )}
      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-lg border border-[var(--error)]/20 bg-[var(--error)]/5 px-4 py-2.5 text-xs text-[var(--error)]">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Status header ── */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-default)] px-6 py-4">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-satoshi-bold uppercase tracking-wider ${statusColor(listing.status)}`}
          >
            <StatusIcon className="h-3 w-3" />
            {statusLabel(listing.status)}
          </span>
          {listing.publishedAt && listing.status === "published" && (
            <span className="text-xs text-[var(--text-tertiary)]">
              Published {new Date(listing.publishedAt).toLocaleDateString()}
            </span>
          )}
          {listing.status === "rejected" && listing.reviewNotes && (
            <span className="text-xs text-[var(--error)]/80 italic">
              Review: {listing.reviewNotes}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && isDirty && (
            <Button onClick={handleSave} disabled={saving} variant="secondary" size="sm">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          )}
          {canSubmit && (
            <Button onClick={handleSubmitForReview} disabled={submitting} variant="tertiary" size="sm">
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              {submitting ? "Submitting..." : "Submit for Review"}
            </Button>
          )}
          {canPublish && (
            <Button onClick={handlePublish} disabled={publishing} variant="primary" size="sm">
              {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
              {publishing ? "Publishing..." : "Publish Now"}
            </Button>
          )}
          {listing.status === "published" && storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--card-color)] px-3 py-1.5 text-xs font-satoshi-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--primary)]"
            >
              <ExternalLink className="h-3 w-3" />
              View on Marketplace
            </a>
          )}
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[1fr_380px]">
        {/* ── Left: Editor ── */}
        <div className="flex flex-col gap-5">
          <fieldset disabled={!canEdit} className="flex flex-col gap-5">
            {/* Title */}
            <div>
              <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                Title
              </label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Agent name on marketplace"
              />
            </div>

            {/* Summary */}
            <div>
              <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                Summary
              </label>
              <textarea
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
                placeholder="Brief one-liner for search results and cards"
                rows={2}
                className="focus-breathe w-full rounded-sm border border-gray-200 bg-[var(--card-color)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-[700ms] hover:border-[var(--primary)] disabled:opacity-50"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detailed description of what this agent does, its capabilities, and ideal use cases"
                rows={6}
                className="focus-breathe w-full rounded-sm border border-gray-200 bg-[var(--card-color)] px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors duration-[700ms] hover:border-[var(--primary)] disabled:opacity-50"
              />
            </div>

            {/* Category + Version row */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="focus-breathe h-10 w-full rounded-sm border border-gray-200 bg-[var(--card-color)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors duration-[700ms] hover:border-[var(--primary)] disabled:opacity-50"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                  Version
                </label>
                <Input
                  value={form.version}
                  onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                  placeholder="1.0.0"
                />
              </div>
            </div>

            {/* Icon URL */}
            <div>
              <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                Icon URL
              </label>
              <Input
                value={form.iconUrl}
                onChange={(e) => setForm((f) => ({ ...f, iconUrl: e.target.value }))}
                placeholder="https://example.com/icon.png"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1.5 block text-xs font-satoshi-bold text-[var(--text-secondary)]">
                Tags
              </label>
              <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-[var(--card-color)] px-3 py-2 min-h-[42px] transition-colors hover:border-[var(--primary)]">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-xs font-satoshi-bold text-[var(--primary)]"
                  >
                    {tag}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--primary)]/20 transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder={form.tags.length === 0 ? "Type a tag and press Enter" : "Add tag..."}
                  className="min-w-[120px] flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                />
              </div>
            </div>
          </fieldset>
        </div>

        {/* ── Right: Live preview ── */}
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Marketplace Preview
          </h3>
          <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--card-color)] p-6 shadow-sm">
            {/* Agent header */}
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)]/10 to-[var(--primary)]/5 text-2xl shadow-inner">
                {form.iconUrl ? (
                  <img
                    src={form.iconUrl}
                    alt=""
                    className="h-8 w-8 rounded-xl object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-[var(--primary)]">&#10022;</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-[10px] font-satoshi-bold uppercase tracking-wider text-[var(--primary)]">
                    Agent
                  </span>
                  <span className="rounded-full bg-[var(--primary)]/5 px-2.5 py-0.5 text-[10px] font-satoshi-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    {CATEGORIES.find((c) => c.value === form.category)?.label || form.category}
                  </span>
                </div>
                <h4 className="mt-2 text-lg font-satoshi-bold text-[var(--text-primary)] leading-tight">
                  {form.title || "Agent Name"}
                </h4>
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                  Version {form.version}
                  {listing.publishedAt && (
                    <> &middot; Published {new Date(listing.publishedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--background)] p-3">
              <div className="text-center">
                <p className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                  {listing.installCount}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Installs</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                  <p className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                    {listing.avgRating.toFixed(1)}
                  </p>
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)]">Rating</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-satoshi-bold text-[var(--text-primary)]">
                  {form.tags.length}
                </p>
                <p className="text-[10px] text-[var(--text-tertiary)]">Tags</p>
              </div>
            </div>

            {/* Tags preview */}
            {form.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[var(--background)] px-2.5 py-0.5 text-[10px] font-satoshi-bold text-[var(--text-secondary)] border border-[var(--border-default)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Summary preview */}
            <div className="mt-4">
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {form.summary || form.description || (
                  <span className="italic text-[var(--text-tertiary)]">No description provided</span>
                )}
              </p>
            </div>

            {/* Description section */}
            {form.description && form.description !== form.summary && (
              <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--background)] p-4">
                <h5 className="text-xs font-satoshi-bold text-[var(--text-secondary)]">
                  What this agent does
                </h5>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-tertiary)]">
                  {form.description}
                </p>
              </div>
            )}
          </div>

          {/* Listing metadata */}
          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--card-color)] p-4">
            <h5 className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Listing Info
            </h5>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Listing ID</span>
                <span className="font-mono text-[var(--text-secondary)]">{listing.id.slice(0, 8)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Slug</span>
                <span className="font-mono text-[var(--text-secondary)]">{listing.slug}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Created</span>
                <span className="text-[var(--text-secondary)]">{new Date(listing.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Updated</span>
                <span className="text-[var(--text-secondary)]">{new Date(listing.updatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
