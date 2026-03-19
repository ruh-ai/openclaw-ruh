"use client";

import Image from "next/image";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConnectToolsSidebarProps {
  toolName: string;
  onClose: () => void;
  onConnect: () => void;
}

export function ConnectToolsSidebar({
  toolName,
  onClose,
  onConnect,
}: ConnectToolsSidebarProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-sm bg-[var(--card-color)] border-l border-[var(--border-default)] shadow-xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h2 className="text-lg font-satoshi-bold text-[var(--text-primary)]">
            Connect {toolName}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Logos */}
          <div className="bg-[var(--background)] border border-[var(--border-default)] rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3 mb-0">
              <div className="w-8 h-8">
                <Image
                  src="/assets/logos/favicon.svg"
                  alt="RUH"
                  width={32}
                  height={32}
                />
              </div>
              <div className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
                <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]" />
              </div>
              <ToolIcon name={toolName} size={32} />
            </div>
          </div>

          {/* Info sections */}
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
                This page will redirect to {toolName}
              </h3>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                You&apos;ll sign in and confirm permissions on {toolName.toLowerCase()}&apos;s page.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
                Private and secure
              </h3>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                Data accessed from {toolName.toLowerCase()} may be used to reply to prompts.
                We do not train generalized models on this data or derivations of it,
                unless you choose to submit it as feedback.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-satoshi-bold text-[var(--text-primary)] mb-1">
                You&apos;re in control of your data
              </h3>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)]">
                You can delete your conversations, which will also delete any{" "}
                {toolName.toLowerCase()} data used in those conversations.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-default)]">
          <Button
            variant="primary"
            className="w-full h-11 gap-2"
            onClick={onConnect}
          >
            Connect
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolIcon({ name, size = 24 }: { name: string; size?: number }) {
  const s = size;
  const iconMap: Record<string, React.ReactNode> = {
    Jira: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#2684FF" />
        <path
          d="M22.3 9.7h-6.1c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1V10.8c0-.6-.5-1.1-1.2-1.1z"
          fill="#fff"
        />
        <path
          d="M19.2 12.8h-6.1c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1v-6.1c0-.6-.5-1.1-1.2-1.1z"
          fill="#fff"
          opacity="0.8"
        />
        <path
          d="M16.1 15.9H10c0 1.7 1.4 3.1 3.1 3.1h1.1v1c0 1.7 1.4 3.1 3.1 3.1v-6.1c0-.6-.5-1.1-1.2-1.1z"
          fill="#fff"
          opacity="0.6"
        />
      </svg>
    ),
    Github: (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#24292e" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M16 7C11.03 7 7 11.03 7 16c0 3.98 2.58 7.35 6.15 8.54.45.08.61-.2.61-.43v-1.5c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.31-1-1.31-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.37 2.1.97 2.61.75.08-.58.31-.97.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.79.93-2.42-.1-.23-.4-1.15.09-2.39 0 0 .75-.24 2.47.93a8.6 8.6 0 014.5 0c1.72-1.17 2.47-.93 2.47-.93.49 1.24.19 2.16.09 2.39.58.63.93 1.44.93 2.42 0 3.46-2.1 4.22-4.11 4.44.32.28.61.83.61 1.67v2.47c0 .24.16.52.62.43A9.01 9.01 0 0025 16c0-4.97-4.03-9-9-9z"
          fill="#fff"
        />
      </svg>
    ),
    "Zoho CRM": (
      <svg width={s} height={s} viewBox="0 0 32 32" fill="none">
        <rect width="32" height="32" rx="6" fill="#fff" stroke="#e5e5e5" />
        <circle cx="10" cy="16" r="2.5" fill="#E42527" />
        <circle cx="16" cy="16" r="2.5" fill="#F0A922" />
        <circle cx="22" cy="16" r="2.5" fill="#00923F" />
        <circle cx="13" cy="11" r="1.5" fill="#4285F4" />
        <circle cx="19" cy="11" r="1.5" fill="#E42527" />
      </svg>
    ),
  };

  return <>{iconMap[name] || <div className="w-8 h-8 rounded-md bg-[var(--border-muted)]" />}</>;
}

export { ToolIcon };
