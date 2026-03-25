"use client";

import { useState } from "react";
import Image from "next/image";
import { Link2, Unlink, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MOCK_TOOLS } from "./mockData";
import { ConnectToolsSidebar, ToolIcon } from "./ConnectToolsSidebar";
import type { ToolItem } from "./types";
import type { SkillGraphNode } from "@/lib/openclaw/types";

// Detect which tools are required based on skill graph content
const TOOL_PATTERNS: { keywords: string[]; tool: ToolItem }[] = [
  {
    keywords: ["slack"],
    tool: { id: "slack", name: "Slack", description: "Send messages, read channels, and manage your Slack workspace.", icon: "slack", connected: false },
  },
  {
    keywords: ["github", "pull_request", "gh_api", "github_api"],
    tool: { id: "github", name: "Github", description: "Code hosting with Git version control, pull requests, and CI/CD integrations.", icon: "github", connected: false },
  },
  {
    keywords: ["jira", "ticket", "sprint", "atlassian"],
    tool: { id: "jira", name: "Jira", description: "Atlassian's project tracker with customizable workflows and agile boards.", icon: "jira", connected: false },
  },
  {
    keywords: ["notion"],
    tool: { id: "notion", name: "Notion", description: "All-in-one workspace for notes, documents, and project management.", icon: "notion", connected: false },
  },
  {
    keywords: ["linear"],
    tool: { id: "linear", name: "Linear", description: "Issue tracking and project management built for modern software teams.", icon: "linear", connected: false },
  },
  {
    keywords: ["google", "gmail", "sheets", "drive", "calendar"],
    tool: { id: "google", name: "Google Workspace", description: "Gmail, Sheets, Drive, Calendar and other Google services.", icon: "google", connected: false },
  },
  {
    keywords: ["zoho"],
    tool: { id: "zoho-crm", name: "Zoho CRM", description: "Zoho OAuth integration for accessing CRM user data.", icon: "zoho", connected: false },
  },
];

function deriveTools(nodes?: SkillGraphNode[] | null): ToolItem[] {
  if (!nodes || nodes.length === 0) return MOCK_TOOLS;
  const allText = nodes
    .map((n) => `${n.skill_id} ${n.name} ${n.description || ""}`)
    .join(" ")
    .toLowerCase();
  const detected = TOOL_PATTERNS.filter(({ keywords }) =>
    keywords.some((kw) => allText.includes(kw))
  ).map(({ tool }) => ({ ...tool }));
  return detected.length > 0 ? detected : MOCK_TOOLS;
}

interface StepConnectToolsProps {
  onContinue: () => void;
  onCancel: () => void;
  onSkip: () => void;
  stepLabel: string;
  skillGraph?: SkillGraphNode[] | null;
}

export function StepConnectTools({
  onContinue,
  onCancel,
  onSkip,
  stepLabel,
  skillGraph,
}: StepConnectToolsProps) {
  const [tools, setTools] = useState<ToolItem[]>(() => deriveTools(skillGraph));
  const [sidebarTool, setSidebarTool] = useState<string | null>(null);

  const hasConnected = tools.some((t) => t.connected);

  const handleConnect = (toolId: string) => {
    setTools((prev) =>
      prev.map((t) => (t.id === toolId ? { ...t, connected: true } : t))
    );
    setSidebarTool(null);
  };

  const handleDisconnect = (toolId: string) => {
    setTools((prev) =>
      prev.map((t) => (t.id === toolId ? { ...t, connected: false } : t))
    );
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6">
        <div className="max-w-2xl mx-auto">
          {/* Step label */}
          <p className="text-xs font-satoshi-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-4">
            {stepLabel}
          </p>

          {/* Title area */}
          <div className="flex items-start gap-3 mb-6">
            <div className="w-9 h-9 shrink-0 mt-0.5">
              <Image
                src="/assets/logos/favicon.svg"
                alt="Configure"
                width={36}
                height={36}
              />
            </div>
            <div>
              <h2 className="text-xl font-satoshi-bold text-[var(--text-primary)]">
                Connect Tools
              </h2>
              <p className="text-sm font-satoshi-regular text-[var(--text-secondary)] mt-0.5">
                Give your agent access to the tools it needs to work.
              </p>
            </div>
          </div>

          {/* Tool cards */}
          <div className="space-y-3">
            {tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center gap-4 bg-[var(--card-color)] border border-[var(--border-stroke)] rounded-xl px-5 py-4 transition-all hover:border-[var(--border-default)]"
              >
                <ToolIcon name={tool.name} size={36} />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-satoshi-bold text-[var(--text-primary)]">
                    {tool.name}
                  </p>
                  <p className="text-xs font-satoshi-regular text-[var(--text-secondary)] mt-0.5 line-clamp-1">
                    {tool.description}
                  </p>
                </div>

                {tool.connected ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => handleDisconnect(tool.id)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => setSidebarTool(tool.id)}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Connect
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--border-default)] bg-[var(--card-color)] px-6 md:px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button variant="tertiary" className="h-10 px-6" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button variant="tertiary" className="h-10 px-5" onClick={onSkip}>
              Skip this step
            </Button>
            <Button
              variant="primary"
              className="h-10 px-6 gap-1.5"
              disabled={!hasConnected}
              onClick={onContinue}
            >
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      {sidebarTool && (() => {
        const tool = tools.find((t) => t.id === sidebarTool);
        if (!tool) return null;
        return (
          <ConnectToolsSidebar
            toolName={tool.name}
            onClose={() => setSidebarTool(null)}
            onConnect={() => handleConnect(tool.id)}
          />
        );
      })()}
    </>
  );
}
