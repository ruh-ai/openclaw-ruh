"use client";

import { Button } from "@/components/ui/button";
import {
  agentsRoute,
  overviewRoute,
  toolsRoute,
  activityRoute,
} from "@/shared/routes";
import {
  Plus,
  MessagesSquare,
  Bot,
  Wrench,
  ChartSpline,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import React from "react";
// useOpenClawChat removed — create page now manages its own state via useBuilderState

interface DeveloperMenuItemsProps {
  onMobileClose?: () => void;
  isCollapsed: boolean;
}

const navItems = [
  { label: "Overview", icon: MessagesSquare, path: overviewRoute },
  { label: "Agents", icon: Bot, path: agentsRoute },
  { label: "Tools", icon: Wrench, path: toolsRoute },
  { label: "Activity", icon: ChartSpline, path: activityRoute },
];

export const DeveloperMenuItems: React.FC<DeveloperMenuItemsProps> = ({
  onMobileClose,
  isCollapsed,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const handleNewAgent = () => {
    if (onMobileClose) onMobileClose();
    router.push("/agents/create");
  };

  const handleNavClick = (path: string) => {
    if (onMobileClose) onMobileClose();
    router.push(path);
  };

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname?.startsWith(path)) return true;
    return false;
  };

  return (
    <div
      className={`flex flex-col gap-1 mt-4 px-2.5 ${isCollapsed ? "items-center" : ""}`}
    >
      {/* New Agent Button */}
      <div
        onClick={handleNewAgent}
        className="h-8.5 px-2 gap-2 flex items-center group hover:bg-color-light rounded cursor-pointer"
      >
        <Button variant="linkSecondary" className="p-0 h-auto w-auto gap-2">
          <div className="w-6.5 h-6.5 flex items-center justify-center">
            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-primary transition-all duration-150 group-hover:w-6.5 group-hover:h-6.5">
              <Plus className="h-3 w-3 text-white" />
            </div>
          </div>
          {!isCollapsed && (
            <div className="text-primary text-xs font-satoshi-bold">
              New Agent
            </div>
          )}
        </Button>
      </div>

      {/* Navigation Items */}
      <div className="flex flex-col">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <div
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className={`py-2 px-2.5 flex items-center cursor-pointer hover:bg-color-light hover:rounded ${
                active ? "bg-color-light rounded" : ""
              }`}
            >
              <Button
                variant="linkSecondary"
                className="p-0! h-auto w-auto gap-3 hover:text-primary"
              >
                <Icon
                  className={`h-4 w-4 ${active ? "text-primary" : ""}`}
                />
                {!isCollapsed && (
                  <div
                    className={`text-xs font-satoshi-medium hover:text-primary ${
                      active
                        ? "text-primary font-satoshi-bold"
                        : "text-text-primary"
                    }`}
                  >
                    {item.label}
                  </div>
                )}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
