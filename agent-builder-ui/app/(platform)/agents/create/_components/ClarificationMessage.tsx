"use client";

import React, { useCallback } from "react";
import { ClarificationQuestion } from "@/lib/openclaw/types";

function warmthMouseHandler(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${((e.clientX - rect.left) / rect.width) * 100}%`);
  e.currentTarget.style.setProperty("--mouse-y", `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

interface ClarificationMessageProps {
  context?: string;
  questions: ClarificationQuestion[];
  onSelectOption?: (text: string) => void;
}

export const ClarificationMessage: React.FC<ClarificationMessageProps> = ({
  context,
  questions,
  onSelectOption,
}) => {
  return (
    <div className="space-y-3">
      {context && (
        <p className="text-sm font-satoshi-regular text-text-primary leading-relaxed">
          {context}
        </p>
      )}

      <div className="space-y-3">
        {questions.map((q, i) => (
          <div
            key={q.id}
            className="rounded-xl border border-border-default bg-[#fafafa] px-4 py-3 space-y-2"
          >
            <p className="text-sm font-satoshi-semibold text-text-primary leading-snug">
              <span className="text-text-tertiary mr-2 font-satoshi-regular">
                {i + 1}.
              </span>
              {q.question}
              {q.required && (
                <span className="ml-1.5 text-[10px] font-satoshi-bold text-primary/70 uppercase tracking-wide">
                  required
                </span>
              )}
            </p>

            {/* Option chips for select / multiselect */}
            {(q.type === "select" || q.type === "multiselect") &&
              q.options &&
              q.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => onSelectOption?.(opt)}
                      onMouseMove={warmthMouseHandler}
                      className="warmth-hover px-2.5 py-1 rounded-full text-xs font-satoshi-regular
                                 border border-border-default bg-white text-text-secondary
                                 hover:border-primary hover:text-primary hover:bg-primary/5
                                 transition-colors cursor-pointer"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

            {/* Placeholder hint for text inputs */}
            {q.type === "text" && q.placeholder && (
              <p className="text-xs font-satoshi-regular text-text-tertiary">
                e.g. {q.placeholder}
              </p>
            )}

            {/* Boolean yes/no chips */}
            {q.type === "boolean" && (
              <div className="flex gap-1.5 pt-0.5">
                {["Yes", "No"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => onSelectOption?.(opt)}
                    onMouseMove={warmthMouseHandler}
                    className="warmth-hover px-3 py-1 rounded-full text-xs font-satoshi-regular
                               border border-border-default bg-white text-text-secondary
                               hover:border-primary hover:text-primary hover:bg-primary/5
                               transition-colors cursor-pointer"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs font-satoshi-regular text-text-tertiary pt-1">
        Answer the questions above in the chat to continue.
      </p>
    </div>
  );
};
