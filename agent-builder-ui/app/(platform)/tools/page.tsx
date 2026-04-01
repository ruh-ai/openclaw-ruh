"use client";

import { ToolResearchWorkspace } from "./_components/ToolResearchWorkspace";

export default function ToolsPage() {
  return (
    <div className="h-full overflow-y-auto bg-[var(--background)] px-6 py-6 md:px-8">
      <ToolResearchWorkspace
        title="Tools"
        description="Research how a tool should be integrated into your agent, compare MCP vs API vs CLI, and get a concrete setup plan before you wire anything into the builder."
      />
    </div>
  );
}
