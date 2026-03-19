"use client";

import { DeveloperSidebar } from "./DeveloperSidebar";
import { MobileDeveloperSidebar } from "./MobileDeveloperSidebar";

interface ConditionalSidebarProps {
  children: React.ReactNode;
}

export const ConditionalSidebar: React.FC<ConditionalSidebarProps> = ({
  children,
}) => {
  return (
    <>
      {/* Mobile Header - Only visible on mobile */}
      <div className="md:hidden">
        <MobileDeveloperSidebar />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex">
          <DeveloperSidebar />
        </div>

        <div className="flex-1 overflow-hidden bg-background">{children}</div>
      </div>
    </>
  );
};
