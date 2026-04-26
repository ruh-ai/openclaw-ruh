"use client";

/**
 * PendingQuestionsPanel — structured UI for `<ask_user>` markers.
 *
 * When the Architect pauses at a checkpoint (Think C0/C1/C2 or Plan P0),
 * it emits `<ask_user>` markers which the copilot-state store accumulates
 * as `pendingQuestions`. This component renders those questions as
 * type-appropriate inputs and sends the composed answers back as a single
 * user message.
 *
 * Rendered above the chat input bar in TabChat when pendingQuestions > 0.
 */

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { AskUserPayload } from "@/lib/openclaw/ag-ui/types";

interface Props {
  questions: AskUserPayload[];
  disabled?: boolean;
  onSubmit: (composedMessage: string) => void;
}

type AnswerValue = string | string[] | boolean | null;

function formatAnswer(q: AskUserPayload, v: AnswerValue): string {
  if (v === null || v === undefined || v === "") return "(skipped)";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(skipped)";
  return String(v);
}

function composeAnswersMessage(
  questions: AskUserPayload[],
  answers: Record<string, AnswerValue>,
): string {
  const lines = questions.map((q, i) => {
    const a = answers[q.id] ?? null;
    return `${i + 1}. ${q.question}\n   → ${formatAnswer(q, a)}`;
  });
  return `Here are my answers:\n\n${lines.join("\n\n")}`;
}

export function PendingQuestionsPanel({ questions, disabled = false, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});

  // Reset local answers when the set of questions changes (new checkpoint).
  const questionsSignature = useMemo(
    () => questions.map((q) => q.id).join("|"),
    [questions],
  );
  useEffect(() => {
    setAnswers({});
  }, [questionsSignature]);

  const allAnswered = questions.every((q) => {
    const a = answers[q.id];
    if (q.type === "boolean") return a === true || a === false;
    if (q.type === "multiselect") return Array.isArray(a) && a.length > 0;
    return typeof a === "string" && a.trim().length > 0;
  });

  const handleSubmit = () => {
    if (!allAnswered || disabled) return;
    onSubmit(composeAnswersMessage(questions, answers));
  };

  return (
    <div className="max-w-2xl mx-auto md:ml-8 px-4 md:px-0 mb-3">
      <div className="rounded-2xl border border-[var(--primary)]/25 bg-[var(--primary)]/[0.04] px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-satoshi-bold uppercase tracking-wider text-[var(--primary)]">
            Architect is waiting on {questions.length} question{questions.length === 1 ? "" : "s"}
          </p>
          <button
            onClick={handleSubmit}
            disabled={!allAnswered || disabled}
            className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-satoshi-bold text-white bg-[var(--primary)] rounded-lg hover:opacity-90 disabled:opacity-30 transition-opacity"
          >
            <Check className="h-3 w-3" />
            Send answers
          </button>
        </div>

        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id} className="space-y-1.5">
              <label className="block text-xs font-satoshi-medium text-[var(--text-primary)]">
                <span className="text-[var(--text-tertiary)] mr-1.5">{i + 1}.</span>
                {q.question}
              </label>
              {q.type === "text" && (
                <input
                  type="text"
                  value={typeof answers[q.id] === "string" ? (answers[q.id] as string) : ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  disabled={disabled}
                  className="w-full px-3 py-1.5 text-sm font-satoshi-regular text-[var(--text-primary)] bg-white border border-[var(--border-default)] rounded-lg focus:outline-none focus:border-[var(--primary)]/60 disabled:opacity-50"
                  placeholder="Type your answer…"
                />
              )}
              {q.type === "boolean" && (
                <div className="flex gap-2">
                  {[
                    { v: true, label: "Yes" },
                    { v: false, label: "No" },
                  ].map(({ v, label }) => (
                    <button
                      key={label}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
                      disabled={disabled}
                      className={`px-3 py-1 text-xs font-satoshi-medium rounded-lg border transition-colors disabled:opacity-50 ${
                        answers[q.id] === v
                          ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                          : "bg-white text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--primary)]/40"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "select" && q.options && (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                      disabled={disabled}
                      className={`px-3 py-1 text-xs font-satoshi-medium rounded-full border transition-colors disabled:opacity-50 ${
                        answers[q.id] === opt
                          ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                          : "bg-white text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--primary)]/40"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              {q.type === "multiselect" && q.options && (
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((opt) => {
                    const current = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                    const isOn = current.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() =>
                          setAnswers((prev) => {
                            const prevArr = Array.isArray(prev[q.id]) ? (prev[q.id] as string[]) : [];
                            return {
                              ...prev,
                              [q.id]: isOn ? prevArr.filter((o) => o !== opt) : [...prevArr, opt],
                            };
                          })
                        }
                        disabled={disabled}
                        className={`px-3 py-1 text-xs font-satoshi-medium rounded-full border transition-colors disabled:opacity-50 ${
                          isOn
                            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                            : "bg-white text-[var(--text-secondary)] border-[var(--border-default)] hover:border-[var(--primary)]/40"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
