"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

interface SummaryItem {
  label: string;
  value: string;
}

interface AgentSummaryProps {
  items: SummaryItem[];
  onProceed: () => void;
}

export const AgentSummary: React.FC<AgentSummaryProps> = ({
  items,
  onProceed,
}) => {
  return (
    <div className="animate-fadeIn">
      {/* Bot message with summary */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
          <Image
            src="/assets/logos/favicon.svg"
            alt="Ruh AI"
            width={32}
            height={32}
            className="rounded-full"
          />
        </div>
        <div className="flex-1 pt-1">
          <p className="text-sm font-satoshi-regular text-text-primary leading-relaxed mb-4">
            I now have everything I need to bring your agent to life. Here&apos;s
            a quick summary of what we&apos;ve configured:
          </p>

          {/* Summary list */}
          <ul className="space-y-1.5 mb-5">
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-center gap-2 text-sm font-satoshi-regular text-text-primary"
              >
                <span className="text-text-tertiary">&bull;</span>
                <span className="text-text-secondary">{item.label} :</span>
                <span>{item.value}</span>
              </li>
            ))}
          </ul>

          {/* Action row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Copy / Like / Dislike icons placeholder */}
            </div>
            <Button
              variant="primary"
              className="h-10 px-5 gap-1.5 rounded-lg"
              onClick={onProceed}
            >
              Proceed
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
