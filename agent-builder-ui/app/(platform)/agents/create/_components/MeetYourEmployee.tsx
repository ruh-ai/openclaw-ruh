"use client";

import { useState, useRef, useEffect } from "react";
import type { EmployeeRevealPayload } from "@/lib/openclaw/ag-ui/types";

/*
 * MeetYourEmployee — Employee Profile Reveal
 * ============================================
 * Full-page reveal card shown after the Architect generates its first
 * structured output. The user "meets" their digital employee before
 * the Think phase begins.
 *
 * Emotional target: TRUST ("this agent gets me").
 *
 * Uses DESIGN.md Alive Additions:
 *   - soul-pulse on avatar
 *   - typewriter-fade on text sections (word-by-word reveal)
 *   - gradient-drift on CTA button
 *   - spark on "first move" card
 *   - soul-born-lite on the entire card at choreography end
 */

// ─── Props ──────────────────────────────────────────────────────────────────

interface MeetYourEmployeeProps {
  reveal: EmployeeRevealPayload;
  agentName: string;
  /** Called when user confirms the reveal. Includes the answer to the clarifying question. */
  onConfirm: (answer: string) => void;
  /** Called when user wants to regenerate (edit description + retry). */
  onRegenerate: () => void;
  /** Number of times the reveal has been shown (1 = first, max 3). */
  attemptCount: number;
  /** Whether container provisioning is still in progress. */
  isProvisioning: boolean;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function MeetYourEmployee({
  reveal,
  agentName,
  onConfirm,
  onRegenerate,
  attemptCount,
  isProvisioning,
}: MeetYourEmployeeProps) {
  const [answer, setAnswer] = useState("");
  const [showContent, setShowContent] = useState(false);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  // Start the reveal choreography after a short delay
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setShowContent(true);
      return;
    }
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, [reveal]);

  const initials = reveal.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleConfirm = () => {
    onConfirm(answer.trim());
  };

  const showSkipOption = attemptCount >= 3;

  return (
    <div className="flex min-h-[calc(100vh-56px)] flex-col items-center justify-center px-6 py-12">
      {/* The reveal card */}
      <div
        className="w-full max-w-[640px] rounded-2xl border border-border-default bg-white p-10 shadow-sm"
        style={{
          animation: showContent ? "soul-pulse 3s ease-in-out infinite" : undefined,
          opacity: showContent ? 1 : 0,
          transition: "opacity 0.3s ease-out",
        }}
      >
        {/* Avatar + Identity */}
        <div className="mb-8 text-center">
          <div
            className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full text-[28px] font-bold text-white"
            style={{
              background: "linear-gradient(135deg, #ae00d0, #7b5aff)",
              outlineOffset: "6px",
            }}
          >
            {initials}
          </div>
          <h2 className="text-[22px] font-bold text-text-primary">{reveal.name}</h2>
          <p className="text-sm italic text-text-secondary">{reveal.title}</p>
        </div>

        {/* Brief-back: What I understand */}
        <div className="mb-6">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
            What I understand about your situation
          </div>
          <p className="border-l-2 border-border-default pl-3 text-[15px] leading-relaxed text-text-primary">
            {reveal.opening}
          </p>
        </div>

        {/* Two-column: What I'll own / What I won't do */}
        <div className="mb-6 grid grid-cols-2 gap-5">
          <div className="rounded-[10px] border border-primary/10 bg-light-purple p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              What I&apos;ll own
            </h4>
            <ul className="space-y-1">
              {reveal.what_i_will_own.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-[10px] border border-primary/10 bg-light-purple p-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
              What I won&apos;t do
            </h4>
            <ul className="space-y-1">
              {reveal.what_i_wont_do.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-snug text-text-secondary">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-border-default" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* First move */}
        <div className="mb-6 rounded-[10px] bg-accent-light p-4">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            My first move
          </h4>
          <p className="text-sm leading-snug text-text-primary">{reveal.first_move}</p>
        </div>

        {/* Clarifying question with inline answer */}
        <div className="mb-8 rounded-[10px] border border-border-default bg-sidebar-bg p-4">
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Before we start, one question
          </h4>
          <p className="mb-3 text-sm italic leading-snug text-text-primary">
            &ldquo;{reveal.clarifying_question}&rdquo;
          </p>
          <textarea
            ref={answerRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here (optional)..."
            rows={2}
            className="w-full resize-none rounded-md border border-border-default bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleConfirm}
            className="rounded-lg px-7 py-3 text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(to right, #ae00d0, #7b5aff)",
            }}
          >
            Yes, let&apos;s build this
          </button>
          {!showSkipOption ? (
            <button
              onClick={onRegenerate}
              className="rounded-lg border border-border-default bg-transparent px-7 py-3 text-sm font-medium text-text-secondary transition-all hover:bg-accent-light"
            >
              Not quite — let me adjust
            </button>
          ) : (
            <button
              onClick={() => onConfirm("")}
              className="rounded-lg border border-border-default bg-transparent px-7 py-3 text-sm font-medium text-text-secondary transition-all hover:bg-accent-light"
            >
              Skip to building
            </button>
          )}
        </div>
      </div>

      {/* Background provisioning status */}
      {isProvisioning && (
        <div className="mt-4 flex items-center gap-1.5 text-xs text-text-tertiary">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Setting up your employee&apos;s workspace in the background...
        </div>
      )}
    </div>
  );
}
