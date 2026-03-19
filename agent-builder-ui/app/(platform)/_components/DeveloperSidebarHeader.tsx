"use client";

import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebarCollapseStore } from "@/hooks/useSidebarCollapseStore";
import { cn } from "@/lib/utils";
import { ruhFaviconIcon } from "@/shared/constants";
import { dashboardRoute } from "@/shared/routes";
import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

export const DeveloperSidebarHeader: React.FC<{
  isCollapsed: boolean;
  onMobileClose?: () => void;
}> = ({ isCollapsed, onMobileClose }) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { toggleCollapse } = useSidebarCollapseStore();
  const [isHoveringLogo, setIsHoveringLogo] = useState(false);

  return (
    <div className="shrink-0 px-2.5">
      <div className="flex mt-3">
        {!isCollapsed || isMobile ? (
          <div className="flex items-center justify-between flex-1 pl-2">
            <Button
              variant="linkSecondary"
              onClick={() => {
                router.push(dashboardRoute);
                if (onMobileClose) onMobileClose();
              }}
              className="p-0! h-auto w-auto gap-2"
            >
              <Image
                src="/assets/logos/ruh-developer-logo.svg"
                alt="Ruh Developer"
                width={120}
                height={28}
                className="h-7 w-auto"
              />
            </Button>

            <Button
              variant="linkSecondary"
              onClick={isMobile ? onMobileClose : toggleCollapse}
              className="p-1! h-auto w-auto"
            >
              <PanelLeftIcon />
            </Button>
          </div>
        ) : (
          <div
            className="relative cursor-pointer flex flex-1"
            onMouseEnter={() => setIsHoveringLogo(true)}
            onMouseLeave={() => setIsHoveringLogo(false)}
          >
            <div
              className={cn(
                "transition-opacity duration-200 items-center flex flex-1 justify-center",
                isHoveringLogo ? "opacity-0" : "opacity-100"
              )}
            >
              <Image
                src={ruhFaviconIcon}
                alt="Ruh Logo"
                width={20}
                height={20}
                className="w-6 h-6"
              />
            </div>

            <div
              className={cn(
                "absolute top-0 left-0 right-0 transition-opacity duration-200 flex items-center justify-center",
                isHoveringLogo
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none"
              )}
            >
              <Button
                variant="linkSecondary"
                onClick={toggleCollapse}
                className="p-1! h-auto w-auto"
                title="Open Sidebar"
              >
                <PanelLeftIcon />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
