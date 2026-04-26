"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  EmployeeRevealPayload,
  RevealFieldKey,
} from "@/lib/openclaw/ag-ui/types";

/*
 * MeetYourEmployee — Progressive Employee Profile Reveal
 * =======================================================
 * The reveal card assembles itself in place as the Architect streams fields.
 * There is no placeholder persona — the same card is the "genesis" state and
 * the final state, it just fills in progressively.
 *
 * Emotional target: TRUST ("this agent gets me, and I just watched it come to life").
 *
 * Uses DESIGN.md Alive Additions (globals.css):
 *   - soul-orb breathing while composing
 *   - typewriter-word / spark as each field lands
 *   - soul-pulse / soul-pulse-strong on card frame
 *   - soul-born once when the full reveal completes
 */

// ─── Props ──────────────────────────────────────────────────────────────────

interface MeetYourEmployeeProps {
  /** Partial profile — fills in progressively as <reveal_field/> markers arrive. */
  reveal: Partial<EmployeeRevealPayload>;
  /** Seed for the abstract soul signature so the same agent gets a stable shape. */
  agentId: string;
  /** User-supplied name (shown as a very soft hint while the real name streams in). */
  agentName: string;
  /** "composing" while streaming, "ready" once <reveal_done/> arrives. */
  phase: "composing" | "ready";
  /** Which keys have landed from the Architect so far (ordered). */
  progress: ReadonlySet<RevealFieldKey>;
  /** Raw Architect prose between markers — shown as the live thought ticker. */
  thoughtStream: string;
  /** Called when user confirms the reveal. Includes the answer to the clarifying question. */
  onConfirm: (answer: string) => void;
  /** Called when user wants to regenerate (edit description + retry). */
  onRegenerate: () => void;
  /** Number of times the reveal has been shown (1 = first, max 3). */
  attemptCount: number;
  /** Whether container provisioning is still in progress. */
  isProvisioning: boolean;
  /**
   * When true, the card is rendered inside the Co-Pilot workspace panel
   * (not a dedicated full-page route). Drops the viewport-height min-height
   * so the card sizes to its parent container instead of pushing the page.
   */
  embedded?: boolean;
}

// ─── Soul signature ─────────────────────────────────────────────────────────
// Abstract gradient blob seeded from agentId. No faces, no initials.

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface SoulSignatureProps {
  agentId: string;
  phase: "composing" | "ready";
  hasName: boolean;
}

function SoulSignature({ agentId, phase, hasName }: SoulSignatureProps) {
  const seed = useMemo(() => hashStr(agentId || "genesis"), [agentId]);

  // Seeded parameters — stable per agent.
  // Use unsigned right-shift (>>>) so `seed` (up to 2^32-1) stays non-negative
  // through the shift; otherwise JS signed-shift produces negative values
  // that make `% 3` return -1/-2 and crash the palette lookup.
  const rotation = seed % 360;
  const blobSkew = ((seed >>> 8) % 40) - 20; // -20..+20 deg
  const accent = (seed >>> 16) % 3;
  const palette = [
    { a: "#ae00d0", b: "#7b5aff", c: "#ffd6fb" },   // primary→secondary
    { a: "#7b5aff", b: "#0f3460", c: "#d6e0ff" },   // secondary→indigo
    { a: "#ae00d0", b: "#ff7bd6", c: "#ffe3f5" },   // primary→pink
  ][accent];

  const isComposing = phase === "composing";
  // Scale grows slightly once the Architect has emitted a name — visual "click" of identity forming.
  const scale = hasName ? 1.0 : 0.88;

  return (
    <div
      className="relative flex h-[120px] w-[120px] items-center justify-center"
      aria-hidden="true"
    >
      {/* Outer soft halo */}
      <div
        className={isComposing ? "soul-orb" : ""}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 50% 45%, ${palette.c} 0%, transparent 70%)`,
          opacity: isComposing ? 0.8 : 0.95,
          transition: "opacity 0.6s ease-out",
        }}
      />
      {/* Signature SVG */}
      <svg
        width="112"
        height="112"
        viewBox="0 0 112 112"
        style={{
          transform: `rotate(${rotation}deg) scale(${scale})`,
          transition: "transform 0.9s cubic-bezier(0.4, 0, 0.2, 1)",
          animation: isComposing
            ? "soul-sig-spin 28s linear infinite"
            : undefined,
        }}
      >
        <defs>
          <linearGradient id={`sig-${seed}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.a} />
            <stop offset="100%" stopColor={palette.b} />
          </linearGradient>
          <radialGradient id={`sig-hi-${seed}`} cx="35%" cy="30%" r="55%">
            <stop offset="0%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Back blob — offset + rotated */}
        <g transform={`translate(56 56) rotate(${blobSkew}) translate(-56 -56)`}>
          <path
            d={`M 56 12
                C 84 12, 102 36, 96 66
                C 90 96, 64 104, 44 96
                C 24 88, 8 68, 16 44
                C 24 20, 42 12, 56 12 Z`}
            fill={`url(#sig-${seed})`}
            opacity={0.28}
          />
        </g>
        {/* Front blob */}
        <path
          d={`M 56 10
              C 82 14, 98 34, 94 58
              C 90 86, 66 98, 46 92
              C 22 84, 10 66, 18 42
              C 24 22, 40 10, 56 10 Z`}
          fill={`url(#sig-${seed})`}
        />
        {/* Highlight */}
        <ellipse cx="44" cy="38" rx="24" ry="18" fill={`url(#sig-hi-${seed})`} />
      </svg>

      {/* Subtle ring while composing */}
      {isComposing && (
        <div
          style={{
            position: "absolute",
            inset: -6,
            borderRadius: "50%",
            border: "1px solid rgba(174, 0, 208, 0.22)",
            animation: "soul-pulse 3s ease-in-out infinite",
          }}
        />
      )}

      {/* Inline keyframes for the slow signature spin (composing only) */}
      <style jsx>{`
        @keyframes soul-sig-spin {
          from { transform: rotate(${rotation}deg) scale(${scale}); }
          to { transform: rotate(${rotation + 360}deg) scale(${scale}); }
        }
        @media (prefers-reduced-motion: reduce) {
          svg { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Reveal card ────────────────────────────────────────────────────────────

export function MeetYourEmployee({
  reveal,
  agentId,
  agentName,
  phase,
  progress,
  thoughtStream,
  onConfirm,
  onRegenerate,
  attemptCount,
  isProvisioning,
  embedded = false,
}: MeetYourEmployeeProps) {
  const [answer, setAnswer] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showSoulBorn, setShowSoulBorn] = useState(false);
  const prevPhaseRef = useRef<"composing" | "ready">(phase);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
  }, []);

  // Fire soul-born exactly once when phase transitions to ready.
  useEffect(() => {
    if (prevPhaseRef.current === "composing" && phase === "ready" && !reducedMotion) {
      setShowSoulBorn(true);
      const t = setTimeout(() => setShowSoulBorn(false), 1300);
      return () => clearTimeout(t);
    }
    prevPhaseRef.current = phase;
  }, [phase, reducedMotion]);

  const isComposing = phase === "composing";
  const has = (k: RevealFieldKey) => progress.has(k);

  const handleConfirm = () => onConfirm(answer.trim());
  const showSkipOption = attemptCount >= 3;

  const thoughtTail = thoughtStream.slice(-260).replace(/\s+/g, " ").trim();

  return (
    <div className={`flex flex-col items-center ${embedded ? "justify-start px-4 py-6" : "min-h-[calc(100vh-56px)] justify-center px-6 py-10"}`}>
      <div
        className={`w-full ${embedded ? "max-w-[560px] p-6" : "max-w-[640px] p-9"} rounded-2xl border border-black/[0.04] bg-white shadow-[0_4px_40px_rgba(0,0,0,0.06)] ${
          showSoulBorn ? "soul-born" : ""
        }`}
        style={{
          animation: showSoulBorn
            ? undefined
            : isComposing && !reducedMotion
              ? "soul-pulse-strong 2.4s ease-in-out infinite"
              : !reducedMotion
                ? "soul-pulse 3s ease-in-out infinite"
                : undefined,
        }}
      >
        {/* ── Identity: signature + name + title ── */}
        <div className="mb-6 flex items-center gap-5">
          <SoulSignature agentId={agentId || agentName} phase={phase} hasName={has("name")} />

          <div className="min-w-0 flex-1">
            {/* Composing hint */}
            {isComposing && !has("name") && (
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]/70">
                The Architect is composing…
              </p>
            )}

            {/* Name */}
            <h2
              className={`text-[24px] font-bold tracking-tight text-[#1a1a2e] ${
                has("name") && !reducedMotion ? "typewriter-word" : ""
              }`}
              style={{ minHeight: 30 }}
            >
              {has("name") ? reveal.name : ""}
              {!has("name") && isComposing && (
                <span className="inline-block h-5 w-32 animate-pulse rounded-md bg-black/[0.04] align-middle" />
              )}
            </h2>

            {/* Title */}
            <p
              className={`mt-1 text-[14px] italic text-[var(--text-secondary)] ${
                has("title") && !reducedMotion ? "typewriter-word" : ""
              }`}
              style={{ minHeight: 20 }}
            >
              {has("title") ? reveal.title : ""}
              {!has("title") && isComposing && (
                <span className="inline-block h-3 w-48 animate-pulse rounded bg-black/[0.03] align-middle" />
              )}
            </p>
          </div>
        </div>

        {/* ── Opening ── */}
        {has("opening") ? (
          <div
            className={`mb-5 border-l-2 border-[var(--primary)]/30 pl-3 ${
              !reducedMotion ? "typewriter-word" : ""
            }`}
          >
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--primary)]">
              What I understand about your situation
            </div>
            <p className="text-[14px] leading-relaxed text-[#1a1a2e]">
              {reveal.opening}
            </p>
          </div>
        ) : isComposing ? (
          <div className="mb-5 border-l-2 border-black/[0.06] pl-3 space-y-1.5">
            <div className="h-[9px] w-44 animate-pulse rounded bg-black/[0.04]" />
            <div className="h-3 w-full animate-pulse rounded bg-black/[0.03]" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-black/[0.03]" />
          </div>
        ) : null}

        {/* ── What I'll own / What I won't do ── */}
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div className="rounded-[10px] border border-[var(--primary)]/10 bg-[#fafafe] p-3.5">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--primary)]">
              What I&apos;ll own
            </h4>
            {has("what_i_will_own") ? (
              <ul className="space-y-1.5">
                {(reveal.what_i_will_own ?? []).map((item, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 text-[12.5px] leading-snug text-[var(--text-secondary)] ${
                      !reducedMotion ? "spark" : ""
                    }`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : isComposing ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-black/[0.04]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-black/[0.04]" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-black/[0.04]" />
              </div>
            ) : null}
          </div>
          <div className="rounded-[10px] border border-[var(--primary)]/10 bg-[#fafafe] p-3.5">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--primary)]">
              What I won&apos;t do
            </h4>
            {has("what_i_wont_do") ? (
              <ul className="space-y-1.5">
                {(reveal.what_i_wont_do ?? []).map((item, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 text-[12.5px] leading-snug text-[var(--text-secondary)] ${
                      !reducedMotion ? "spark" : ""
                    }`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-default)]" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : isComposing ? (
              <div className="space-y-2">
                <div className="h-3 w-full animate-pulse rounded bg-black/[0.04]" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-black/[0.04]" />
              </div>
            ) : null}
          </div>
        </div>

        {/* ── First move ── */}
        {has("first_move") ? (
          <div
            className={`mb-5 rounded-[10px] bg-[var(--primary)]/[0.05] p-3.5 ${
              !reducedMotion ? "typewriter-word" : ""
            }`}
          >
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--primary)]">
              My first move
            </h4>
            <p className="text-[13.5px] leading-snug text-[#1a1a2e]">
              {reveal.first_move}
            </p>
          </div>
        ) : isComposing ? (
          <div className="mb-5 rounded-[10px] bg-black/[0.02] p-3.5 space-y-1.5">
            <div className="h-[9px] w-24 animate-pulse rounded bg-black/[0.04]" />
            <div className="h-3 w-full animate-pulse rounded bg-black/[0.03]" />
          </div>
        ) : null}

        {/* ── Clarifying question + answer box ── */}
        {has("clarifying_question") ? (
          <div
            className={`mb-7 rounded-[10px] border border-[var(--border-default)] bg-[var(--sidebar-bg)] p-3.5 ${
              !reducedMotion ? "typewriter-word" : ""
            }`}
          >
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Before we start, one question
            </h4>
            <p className="mb-2.5 text-[13.5px] italic leading-snug text-[#1a1a2e]">
              &ldquo;{reveal.clarifying_question}&rdquo;
            </p>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here (optional)…"
              rows={2}
              className="w-full resize-none rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-[13.5px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20"
              disabled={phase !== "ready"}
            />
          </div>
        ) : null}

        {/* ── Action row — only visible when ready ── */}
        {phase === "ready" ? (
          <div className={`flex items-center justify-center gap-3 ${!reducedMotion ? "spark" : ""}`}>
            <button
              onClick={handleConfirm}
              className="rounded-lg px-7 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ background: "linear-gradient(to right, #ae00d0, #7b5aff)" }}
            >
              Yes, let&apos;s build this
            </button>
            {!showSkipOption ? (
              <button
                onClick={onRegenerate}
                className="rounded-lg border border-[var(--border-default)] bg-transparent px-7 py-3 text-sm font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--accent-light)]"
              >
                Not quite — let me adjust
              </button>
            ) : (
              <button
                onClick={() => onConfirm("")}
                className="rounded-lg border border-[var(--border-default)] bg-transparent px-7 py-3 text-sm font-medium text-[var(--text-secondary)] transition-all hover:bg-[var(--accent-light)]"
              >
                Skip to building
              </button>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Live thought ticker (composing only) ── */}
      {isComposing ? (
        <div
          className="mt-4 w-full max-w-[640px] overflow-hidden px-6"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <p
            className="whitespace-nowrap font-mono text-[11px] italic text-[var(--text-tertiary)]"
            style={{
              transition: "opacity 0.4s",
              opacity: thoughtTail ? 0.7 : 0.35,
            }}
          >
            {thoughtTail || "Listening for the Architect…"}
          </p>
        </div>
      ) : null}

      {/* Background provisioning status */}
      {isProvisioning ? (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Setting up your employee&apos;s workspace in the background…
        </div>
      ) : null}
    </div>
  );
}
