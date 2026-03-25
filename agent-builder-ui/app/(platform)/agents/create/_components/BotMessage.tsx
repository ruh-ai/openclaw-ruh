"use client";

import React from "react";
import Image from "next/image";
import MessageContent from "./MessageContent";
import { ClarificationMessage } from "./ClarificationMessage";
import { ChatMessage } from "@/lib/openclaw/types";

interface BotMessageProps {
  message: ChatMessage;
  animate?: boolean;
  onSelectOption?: (text: string) => void;
}

export const BotMessage: React.FC<BotMessageProps> = ({
  message,
  animate = false,
  onSelectOption,
}) => {
  const renderContent = () => {
    if (
      message.responseType === "clarification" &&
      message.questions &&
      message.questions.length > 0
    ) {
      return (
        <ClarificationMessage
          context={message.clarificationContext}
          questions={message.questions}
          onSelectOption={onSelectOption}
        />
      );
    }
    return <MessageContent content={message.content} />;
  };

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
        {renderContent()}
      </div>
    </div>
  );
};
