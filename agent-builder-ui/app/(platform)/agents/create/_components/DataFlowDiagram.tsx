"use client";

import type { ReviewSkillNode } from "@/lib/openclaw/parse-response";

interface DataFlowDiagramProps {
  nodes: ReviewSkillNode[];
}

// Node type detection and color mapping (matching Figma)
function getNodeStyle(node: ReviewSkillNode, isFirst: boolean, isLast: boolean) {
  if (isFirst) {
    return { border: "border-[#10b981]", dot: "bg-[#00c950]", label: "Start" };
  }
  if (isLast) {
    return { border: "border-[#ef4444]", dot: "bg-[#fb2c36]", label: "End" };
  }
  // LLM/agent-like nodes
  if (
    node.source === "custom" ||
    node.name.toLowerCase().includes("llm") ||
    node.name.toLowerCase().includes("agent") ||
    node.name.toLowerCase().includes("classif") ||
    node.name.toLowerCase().includes("generat")
  ) {
    return { border: "border-[#a855f7]", dot: "bg-[#ad46ff]", label: "LLM Agent" };
  }
  // Tool nodes
  return { border: "border-[#3b82f6]", dot: "bg-[#2b7fff]", label: "Tool Node" };
}

// Build ordered layers from dependency graph
function buildLayers(nodes: ReviewSkillNode[]): ReviewSkillNode[][] {
  const nodeMap = new Map(nodes.map((n) => [n.skill_id, n]));
  const layers: ReviewSkillNode[][] = [];
  const placed = new Set<string>();

  let remaining = [...nodes];

  while (remaining.length > 0) {
    const layer = remaining.filter((n) =>
      n.depends_on.every((dep) => placed.has(dep) || !nodeMap.has(dep))
    );

    if (layer.length === 0) {
      layers.push(remaining);
      break;
    }

    layers.push(layer);
    layer.forEach((n) => placed.add(n.skill_id));
    remaining = remaining.filter((n) => !placed.has(n.skill_id));
  }

  return layers;
}

export const DataFlowDiagram: React.FC<DataFlowDiagramProps> = ({ nodes }) => {
  if (!nodes || nodes.length === 0) return null;

  const layers = buildLayers(nodes);
  const totalNodes = nodes.length;

  let nodeIndex = 0;

  return (
    <div className="flex flex-col items-center py-4">
      {layers.map((layer, layerIdx) => {
        const layerNodes = layer.map((node) => {
          const currentIdx = nodeIndex++;
          const isFirst = currentIdx === 0;
          const isLast = currentIdx === totalNodes - 1;
          return { node, isFirst, isLast };
        });

        return (
          <div key={layerIdx}>
            {/* Connector line between layers */}
            {layerIdx > 0 && (
              <div className="flex justify-center">
                <div className="w-px h-6 bg-[#e2e2e2]" />
              </div>
            )}

            <div className="flex gap-4 justify-center">
              {layerNodes.map(({ node, isFirst, isLast }) => {
                const style = getNodeStyle(node, isFirst, isLast);
                return (
                  <div
                    key={node.skill_id}
                    className={`relative bg-white border-[1.6px] ${style.border} rounded-lg px-4 py-3 min-w-[150px] max-w-[180px]`}
                  >
                    {/* Top handle */}
                    <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-[#1a192b] border border-white" />

                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${style.dot}`} />
                        <span className="text-xs font-normal text-[#222022]">
                          {style.label}
                        </span>
                      </div>
                      <p className="text-xs text-[#4a5565] text-center">
                        {node.name}
                      </p>
                    </div>

                    {/* Bottom handle */}
                    <div className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-[#1a192b] border border-white" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
