import { DashboardShell } from "@/components/layout/DashboardShell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // In production, agent name comes from environment or config
  const agentName = process.env.AGENT_NAME || "Agent";
  const agentAvatar = process.env.AGENT_AVATAR || undefined;

  return (
    <DashboardShell agentName={agentName} agentAvatar={agentAvatar}>
      {children}
    </DashboardShell>
  );
}
