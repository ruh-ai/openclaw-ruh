"use client";

import { useState } from "react";
import type { ClarificationQuestion } from "@/lib/openclaw/parse-response";

interface ClarificationCardProps {
  questions: ClarificationQuestion[];
  onAnswer: (answers: Record<string, string>) => void;
}

export const ClarificationCard: React.FC<ClarificationCardProps> = ({
  questions,
  onAnswer,
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customText, setCustomText] = useState<Record<string, string>>({});
  const [usingCustom, setUsingCustom] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleOptionSelect = (questionId: string, option: string) => {
    if (submitted) return;
    const current = answers[questionId];
    const currentSelections = current ? current.split(", ") : [];
    const question = questions.find((q) => q.id === questionId);

    // Clear custom text when selecting a pill
    setUsingCustom((prev) => ({ ...prev, [questionId]: false }));
    setCustomText((prev) => ({ ...prev, [questionId]: "" }));

    if (question?.multiple) {
      const updated = currentSelections.includes(option)
        ? currentSelections.filter((s) => s !== option)
        : [...currentSelections, option];
      setAnswers((prev) => ({ ...prev, [questionId]: updated.join(", ") }));
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: option }));
    }
  };

  const handleCustomTextChange = (questionId: string, value: string) => {
    if (submitted) return;
    setCustomText((prev) => ({ ...prev, [questionId]: value }));
    if (value.trim()) {
      setUsingCustom((prev) => ({ ...prev, [questionId]: true }));
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
    } else {
      setUsingCustom((prev) => ({ ...prev, [questionId]: false }));
      setAnswers((prev) => ({ ...prev, [questionId]: "" }));
    }
  };

  const handleSubmit = () => {
    setSubmitted(true);
    onAnswer(answers);
  };

  const allRequiredAnswered = questions
    .filter((q) => q.required !== false)
    .every((q) => answers[q.id]?.trim());

  return (
    <div className="my-3 flex flex-col gap-4 max-w-[816px]">
      {questions.map((q) => {
        const hasOptions = q.options && q.options.length > 0;
        const isCustom = usingCustom[q.id];

        return (
          <div
            key={q.id}
            className="bg-[#fdfbff] border border-[#e2e2e2] rounded-2xl px-[23px] py-4 flex flex-col gap-3"
          >
            <p className="text-base font-bold text-[#222022] tracking-[-0.32px] leading-[1.4]">
              {q.question}
              {q.required === false && (
                <span className="text-[#3c3a3d] ml-1 font-normal text-sm">
                  (optional)
                </span>
              )}
            </p>

            <div className="border-t border-[#e2e2e2]" />

            {/* Option pills */}
            {hasOptions && (
              <div className="flex flex-wrap gap-2">
                {q.options!.map((option) => {
                  const isSelected =
                    !isCustom &&
                    answers[q.id]?.split(", ").includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      disabled={submitted}
                      onClick={() => handleOptionSelect(q.id, option)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all duration-200
                        ${
                          isSelected
                            ? "border-[#ae00d0] bg-[#f9f3ff] text-[#ae00d0]"
                            : "border-[#e2e2e2] bg-[#f3f4f6] text-[#3c3a3d] hover:border-[#ae00d0] hover:text-[#ae00d0]"
                        }
                        ${submitted ? "opacity-60 cursor-default" : "cursor-pointer"}
                      `}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Custom text input — always shown */}
            <div className="flex items-center gap-2">
              {hasOptions && (
                <span className="text-xs text-[#999] shrink-0">or</span>
              )}
              <input
                type="text"
                placeholder={q.example || (hasOptions ? "Type something else..." : "Type your answer...")}
                value={customText[q.id] || ""}
                onChange={(e) => handleCustomTextChange(q.id, e.target.value)}
                disabled={submitted}
                className="w-full px-3 py-2 rounded-lg border border-[#e2e2e2] bg-white text-sm text-[#222022] placeholder:text-[#999] focus:outline-none focus:ring-2 focus:ring-[#ae00d0]/20 focus:border-[#ae00d0] transition-colors disabled:opacity-60"
              />
            </div>
          </div>
        );
      })}

      {!submitted && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allRequiredAnswered}
            className="px-4 py-2.5 rounded-md text-sm font-bold text-white bg-[#ae00d0] hover:bg-[#ae00d0]/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            Submit Answers
          </button>
        </div>
      )}
    </div>
  );
};
