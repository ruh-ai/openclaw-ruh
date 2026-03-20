"use client";

import { useMemo } from "react";
import Image from "next/image";
import MessageContent from "./MessageContent";
import { AgentReviewCard } from "./AgentReviewCard";
import {
  parseAgentContent,
  type ParsedReviewData,
} from "@/lib/openclaw/parse-response";

interface BotMessageProps {
  message: string;
  animate?: boolean;
  onSendMessage?: (text: string) => void;
}

export const BotMessage: React.FC<BotMessageProps> = ({
  message,
  animate = false,
}) => {
  const parsed = useMemo(() => parseAgentContent(message), [message]);

  return (
    <div
      className={`flex items-start gap-3 ${animate ? "animate-fadeIn" : ""}`}
    >
      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5">
        <Image
          src="/assets/logos/favicon.svg"
          alt="Ruh AI"
          width={32}
          height={32}
          className="rounded-full"
        />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        {/* Text before JSON block */}
        {parsed.before && <MessageContent content={parsed.before} />}

        {/* Clarification — handled by page-level wizard now, just show the before text */}

        {/* Agent review card */}
        {parsed.json?.type === "ready_for_review" && (
          <AgentReviewCard data={parsed.json as ParsedReviewData} />
        )}

        {/* Text after JSON block (skip for clarification — wizard handles it) */}
        {parsed.after && parsed.json?.type !== "clarification" && (
          <MessageContent content={parsed.after} />
        )}
      </div>
    </div>
  );
};
