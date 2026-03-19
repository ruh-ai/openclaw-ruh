import { FlowNode } from "./FlowNode";

export function DataFlowDiagram() {
  return (
    <div className="flex flex-col items-center py-4 gap-0">
      <FlowNode
        label="Start"
        sub="Entry Point"
        borderColor="border-[#10b981]"
        dotColor="bg-[#00c950]"
        width="w-[150px]"
      />
      <div className="w-px h-6 bg-[var(--border-default)]" />
      <FlowNode
        label="LLM Agent"
        sub="Intent Classification"
        borderColor="border-[#a855f7]"
        dotColor="bg-[#ad46ff]"
        width="w-[180px]"
      />
      <div className="flex w-full max-w-[380px] mt-1">
        <span className="flex-1 text-center text-[11px] font-satoshi-regular text-[var(--text-secondary)]">
          DB Query
        </span>
        <span className="flex-1 text-center text-[11px] font-satoshi-regular text-[var(--text-secondary)]">
          Web Search
        </span>
      </div>
      <div className="flex items-start justify-center gap-6 w-full max-w-[380px]">
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-[var(--border-default)]" />
          <FlowNode
            label="Tool Node"
            sub="Database Query (MCP)"
            borderColor="border-[#3b82f6]"
            dotColor="bg-[#2b7fff]"
            width="w-[160px]"
          />
          <div className="w-px h-4 bg-[var(--border-default)]" />
        </div>
        <div className="flex flex-col items-center">
          <div className="w-px h-4 bg-[var(--border-default)]" />
          <FlowNode
            label="Tool Node"
            sub="Search API (MCP)"
            borderColor="border-[#3b82f6]"
            dotColor="bg-[#2b7fff]"
            width="w-[160px]"
          />
          <div className="w-px h-4 bg-[var(--border-default)]" />
        </div>
      </div>
      <div className="w-px h-1 bg-[var(--border-default)]" />
      <FlowNode
        label="LLM Agent"
        sub="Response Generation"
        borderColor="border-[#a855f7]"
        dotColor="bg-[#ad46ff]"
        width="w-[180px]"
      />
      <div className="w-px h-6 bg-[var(--border-default)]" />
      <FlowNode
        label="End"
        sub="Return Response"
        borderColor="border-[#ef4444]"
        dotColor="bg-[#fb2c36]"
        width="w-[150px]"
      />
    </div>
  );
}
