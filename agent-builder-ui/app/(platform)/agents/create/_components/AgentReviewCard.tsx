"use client";

import { FileJson, ChevronRight, Calendar, Wrench } from "lucide-react";
import type { ParsedReviewData } from "@/lib/openclaw/parse-response";
import { DataFlowDiagram } from "./DataFlowDiagram";

interface AgentReviewCardProps {
  data: ParsedReviewData;
}

export const AgentReviewCard: React.FC<AgentReviewCardProps> = ({ data }) => {
  const { agent_metadata, skill_graph, adapter_availability, outputs } = data;

  const isEmoji =
    agent_metadata.avatar && !agent_metadata.avatar.startsWith("http");

  // Collect connector names from adapter_availability
  const connectors = adapter_availability
    ? Object.entries(adapter_availability).filter(([, v]) => v.has_adapter)
    : [];

  return (
    <div className="my-3 flex flex-col gap-4 max-w-[816px]">
      {/* Agent header card */}
      <div className="bg-[#fdfbff] border border-[#e2e2e2] rounded-2xl px-[23px] py-4 flex items-center gap-3.5">
        <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center text-xl shrink-0">
          {isEmoji ? (
            <span className="text-2xl">{agent_metadata.avatar}</span>
          ) : (
            <span className="text-xl">🤖</span>
          )}
        </div>
        <h3 className="text-xl font-bold text-[#222022] tracking-[-0.2px] leading-[1.4]">
          {agent_metadata.agent_name}
        </h3>
      </div>

      {/* Description / Domain info (agent provides these) */}
      {(agent_metadata.domain || agent_metadata.primary_users || agent_metadata.tone) && (
        <SectionCard title="About">
          <div className="space-y-2">
            {agent_metadata.domain && (
              <BulletItem text={`Domain: ${agent_metadata.domain}`} />
            )}
            {agent_metadata.primary_users && (
              <BulletItem text={`Target users: ${agent_metadata.primary_users}`} />
            )}
            {agent_metadata.tone && (
              <BulletItem text={`Tone: ${agent_metadata.tone}`} />
            )}
            {skill_graph?.description && (
              <BulletItem text={skill_graph.description} />
            )}
          </div>
        </SectionCard>
      )}

      {/* Data Flow */}
      {skill_graph?.nodes && skill_graph.nodes.length > 0 && (
        <SectionCard title="Data flow">
          <DataFlowDiagram nodes={skill_graph.nodes} />
        </SectionCard>
      )}

      {/* Skills list */}
      {skill_graph?.nodes && skill_graph.nodes.length > 0 && (
        <SectionCard title="Skills">
          <div className="space-y-3">
            {skill_graph.nodes.map((node) => (
              <div
                key={node.skill_id}
                className="flex items-center gap-2 py-0.5"
              >
                <FileJson className="w-[18px] h-[18px] text-[#3c3a3d] shrink-0" />
                <span className="text-sm font-medium text-[#3c3a3d] leading-[22px]">
                  {node.name}
                </span>
                <ChevronRight className="w-4 h-4 text-[#3c3a3d] shrink-0" />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Triggers */}
      {(agent_metadata.schedule_description || agent_metadata.cron_expression) && (
        <SectionCard title="Triggers">
          <div className="space-y-3">
            <div className="flex items-center gap-2 py-0.5">
              <Calendar className="w-[18px] h-[18px] text-[#3c3a3d] shrink-0" />
              <span className="text-sm font-medium text-[#3c3a3d] leading-[22px]">
                {agent_metadata.schedule_description || agent_metadata.cron_expression}
              </span>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Outputs */}
      {outputs && outputs.length > 0 && (
        <SectionCard title="Outputs">
          <div className="space-y-3">
            {outputs.map((output, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="text-sm font-medium text-[#3c3a3d] leading-[22px]">
                  {output.type}
                  {output.schedule && ` — ${output.schedule}`}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Connectors */}
      {connectors.length > 0 && (
        <SectionCard title="Connectors">
          <div className="flex items-center gap-2 py-0.5 flex-wrap">
            <Wrench className="w-[18px] h-[18px] text-[#3c3a3d] shrink-0" />
            <span className="text-sm font-medium text-[#3c3a3d] leading-[22px]">
              Connectors
            </span>
            {connectors.map(([name]) => (
              <span
                key={name}
                className="bg-[#f3f4f6] border border-[#e2e2e2] rounded-md px-1.5 py-1 text-xs text-[#3c3a3d]"
              >
                {name}
              </span>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
};

// Section card matching Figma Form pattern
function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#fdfbff] border border-[#e2e2e2] rounded-2xl px-[23px] py-4 flex flex-col gap-4">
      <h4 className="text-base font-bold text-[#222022] tracking-[-0.32px] leading-[1.4]">
        {title}
      </h4>
      <div className="border-t border-[#e2e2e2]" />
      {children}
    </div>
  );
}

// Bullet list item matching Figma Rules pattern
function BulletItem({ text }: { text: string }) {
  return (
    <div className="flex items-center py-0.5">
      <ul className="list-disc ml-[21px]">
        <li className="text-sm font-medium text-[#3c3a3d] leading-[22px]">
          {text}
        </li>
      </ul>
    </div>
  );
}
