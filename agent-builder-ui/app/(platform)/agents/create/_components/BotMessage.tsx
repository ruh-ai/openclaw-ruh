"use client";

import Image from "next/image";
import MessageContent from "./MessageContent";

interface BotMessageProps {
  message: string;
  animate?: boolean;
}

export const BotMessage: React.FC<BotMessageProps> = ({
  message,
  animate = false,
}) => {
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
        <MessageContent content={message} />
      </div>
    </div>
  );
};
