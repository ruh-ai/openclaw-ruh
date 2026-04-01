"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ruhFaviconIcon } from "@/shared/constants";
import { Menu } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";
import { DeveloperSidebar } from "./DeveloperSidebar";
import { dashboardRoute } from "@/shared/routes";

export const MobileDeveloperSidebar = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);

  const onClose = () => setIsOpen(false);

  return (
    <div className="md:hidden overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-default bg-card-color overflow-hidden">
        {/* Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsOpen(true)}
          className="h-9 w-9"
        >
          <Menu className="h-5 w-5 text-text-primary" />
        </Button>

        {/* Logo */}
        <Button
          variant="linkSecondary"
          onClick={() => router.push(dashboardRoute)}
          className="p-0! h-auto w-auto"
        >
          <Image src={ruhFaviconIcon} alt="Ruh Logo" width={24} height={24} />
        </Button>

        <div className="w-10"></div>
      </div>

      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent
          side="left"
          className="w-60 p-0 bg-card-color"
          noCloseIcon
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <DeveloperSidebar isMobile={true} onMobileClose={onClose} />
        </SheetContent>
      </Sheet>
    </div>
  );
};
