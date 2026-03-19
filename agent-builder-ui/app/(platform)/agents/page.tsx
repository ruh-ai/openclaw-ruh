"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
  Search,
  Clock3,
  GitCompare,
  Plug,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function AgentsPage() {
  const router = useRouter();

  const handleCreateAgent = () => {
    router.push("/agents/create");
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 md:px-8 py-5 shrink-0">
        <h1 className="text-xl md:text-2xl font-satoshi-bold text-text-primary">
          Agents
        </h1>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-placeholder" />
            <Input
              placeholder="Search Agent..."
              className="pl-9 h-10 w-[200px] md:w-[280px] border border-border-default rounded-lg bg-white text-sm font-satoshi-regular"
            />
          </div>

          {/* Create New Agent Button */}
          <Button
            variant="primary"
            className="h-10 px-4 gap-2 rounded-lg"
            onClick={handleCreateAgent}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create New Agent</span>
            <span className="sm:hidden">Create</span>
          </Button>
        </div>
      </div>

      {/* Empty State Content */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="flex flex-col items-center text-center max-w-lg">
          {/* Illustration placeholder — replace with your SVG */}
          <div className="w-48 h-48 mb-4 relative">
            <Image
              src="/assets/illustrations/agents-empty.svg"
              alt="Create your first AI Agent"
              fill
              className="object-contain"
            />
          </div>

          <h2 className="text-lg md:text-xl font-satoshi-bold text-text-primary mb-2">
            Create Your First AI Employee
          </h2>
          <p className="text-xs font-satoshi-regular text-text-secondary mb-6 max-w-md leading-4">
            AI Employees handle repetitive tasks automatically, working around
            the clock so you can focus on what matters most.
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-8">
            <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
              <Clock3 className="h-4 w-4 text-brand-secondary" />
              <span>24/7 availability</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
              <GitCompare className="h-4 w-4 text-brand-secondary" />
              <span>Custom Workflows</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-satoshi-regular text-text-secondary">
              <Plug className="h-4 w-4 text-brand-secondary" />
              <span>Easy Integration</span>
            </div>
          </div>

          {/* Create Agent CTA */}
          <Button
            variant="primary"
            className="h-11 px-6 gap-2 rounded-lg text-sm"
            onClick={handleCreateAgent}
          >
            <Plus className="h-4 w-4" />
            Create Agent
          </Button>
        </div>
      </div>
    </div>
  );
}
