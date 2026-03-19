"use client";

import { useSidebarCollapseStore } from "@/hooks/useSidebarCollapseStore";
import { cn } from "@/lib/utils";
import React from "react";
import { DeveloperSidebarHeader } from "./DeveloperSidebarHeader";
import { DeveloperMenuItems } from "./DeveloperMenuItems";
import { UserProfileSection } from "./UserProfileSection";

interface DeveloperSidebarProps {
  className?: string;
  onMobileClose?: () => void;
  isMobile?: boolean;
}

export const DeveloperSidebar: React.FC<DeveloperSidebarProps> = ({
  className,
  onMobileClose,
  isMobile = false,
}) => {
  const { isCollapsed: isCollapsedStore } = useSidebarCollapseStore();

  // For mobile, always show expanded view
  const isCollapsed = isMobile ? false : isCollapsedStore;

  return (
    <div
      className={cn(
        "relative bg-sidebar-background transition-all duration-300 ease-in-out flex flex-col",
        "h-full border-r border-border-muted",
        isCollapsed
          ? "w-[50px] md:w-[61px]"
          : "w-[200px] md:w-[243px]",
        className
      )}
    >
      {/* Header Section - Logo + Collapse Toggle */}
      <DeveloperSidebarHeader
        isCollapsed={isCollapsed}
        onMobileClose={onMobileClose}
      />

      {/* Navigation Menu Items */}
      <div className="shrink-0">
        <DeveloperMenuItems
          onMobileClose={onMobileClose}
          isCollapsed={isCollapsed}
        />
      </div>

      {/* Spacer to push user profile to bottom */}
      <div className="flex-1" />

      {/* User Profile Section - Always at bottom */}
      <UserProfileSection isCollapsed={isCollapsed} onClose={onMobileClose} />
    </div>
  );
};
