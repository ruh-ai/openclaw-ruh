import { FlowNode } from "./FlowNode";
import type { SkillGraphNode } from "@/lib/openclaw/types";

interface DataFlowDiagramProps {
  nodes?: SkillGraphNode[];
}

// Assign a colour per source type
function nodeColors(source: SkillGraphNode["source"]) {
  switch (source) {
    case "data_ingestion":
      return { border: "border-[#f59e0b]", dot: "bg-[#f59e0b]" };
    case "clawhub":
    case "skills_sh":
      return { border: "border-[#3b82f6]", dot: "bg-[#2b7fff]" };
    default:
      return { border: "border-[#a855f7]", dot: "bg-[#ad46ff]" };
  }
}

export function DataFlowDiagram({ nodes }: DataFlowDiagramProps) {
  // Fall back to static diagram when no real nodes
  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center py-4 gap-0">
        <FlowNode label="Start" sub="Entry Point" borderColor="border-[#10b981]" dotColor="bg-[#00c950]" width="w-[150px]" />
        <div className="w-px h-6 bg-[var(--border-default)]" />
        <FlowNode label="End" sub="No skills defined" borderColor="border-[#ef4444]" dotColor="bg-[#fb2c36]" width="w-[150px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-4 gap-0">
      {/* Start */}
      <FlowNode
        label="Start"
        sub="Entry Point"
        borderColor="border-[#10b981]"
        dotColor="bg-[#00c950]"
        width="w-[160px]"
      />

      {/* Skill nodes in order */}
      {nodes.map((node, i) => {
        const { border, dot } = nodeColors(node.source);
        const label = node.name || node.skill_id;
        const sub = node.description
          ? node.description.slice(0, 40) + (node.description.length > 40 ? "…" : "")
          : node.source;
        return (
          <div key={node.skill_id} className="flex flex-col items-center">
            <div className="w-px h-6 bg-[var(--border-default)]" />
            {i > 0 && nodes[i - 1].skill_id && (
              <span className="text-[10px] font-satoshi-regular text-[var(--text-tertiary)] mb-1">
                → {nodes[i - 1].skill_id}
              </span>
            )}
            <FlowNode
              label={label}
              sub={sub}
              borderColor={border}
              dotColor={dot}
              width="w-[220px]"
            />
          </div>
        );
      })}

      {/* End */}
      <div className="w-px h-6 bg-[var(--border-default)]" />
      <FlowNode
        label="End"
        sub="Return Response"
        borderColor="border-[#ef4444]"
        dotColor="bg-[#fb2c36]"
        width="w-[160px]"
      />
    </div>
  );
}
