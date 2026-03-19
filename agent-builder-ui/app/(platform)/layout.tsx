import { Metadata } from "next";
import { generateCanonicalMetadata } from "@/lib/utils/canonical";
import { ConditionalSidebar } from "./_components/ConditionalSidebar";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Manage your AI agents and developer tools with Ruh OpenClaw Developer platform",
  ...generateCanonicalMetadata("/"),
};

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex flex-col h-screen bg-background overflow-hidden max-w-[1800px] mx-auto">
      <ConditionalSidebar>{children}</ConditionalSidebar>
    </main>
  );
}
