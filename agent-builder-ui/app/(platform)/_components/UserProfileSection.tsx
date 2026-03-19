"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/hooks/use-user";
import { authApi } from "@/app/api/auth";
import { loginRoute, settingsRoute } from "@/shared/routes";
import {
  ChevronDown,
  ExternalLink,
  LifeBuoy,
  Loader2,
  LogOut,
  Settings2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { toast } from "sonner";

interface UserProfileSectionProps {
  className?: string;
  onClose?: () => void;
  isCollapsed?: boolean;
}

export const UserProfileSection: React.FC<UserProfileSectionProps> = ({
  className = "",
  onClose,
  isCollapsed = false,
}) => {
  const router = useRouter();
  const { user } = useUserStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Derive display values from user store
  const userName = user?.fullName || "User";
  const userEmail = user?.email || "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleManageAccount = () => {
    onClose?.();
    router.push(settingsRoute);
  };

  const handleHelp = () => {
    onClose?.();
    window.open("https://ruh.ai/support", "_blank");
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
      router.push(loginRoute);
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Logout failed. Redirecting to login...");
      // Even on error, redirect to login
      router.push(loginRoute);
    } finally {
      setIsLoggingOut(false);
      onClose?.();
    }
  };

  return (
    <div
      className={cn(
        "shrink-0 mx-2 my-2 px-1.5 py-2 mt-auto hover:bg-color-light rounded-lg",
        className
      )}
    >
      <DropdownMenu
        onOpenChange={(open) => setIsDropdownOpen(open)}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center w-full gap-2 cursor-pointer bg-transparent border-none p-0 outline-none"
          >
            {isCollapsed ? (
              <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center shrink-0">
                <span className="text-white text-xs font-satoshi-medium">
                  {userInitials}
                </span>
              </div>
            ) : (
              <div className="flex gap-2 flex-1 items-center">
                <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-satoshi-medium">
                    {userInitials}
                  </span>
                </div>
                <div className="flex-1 flex flex-col gap-px min-w-0 items-start">
                  <div className="text-xs text-text-primary font-satoshi-bold truncate max-w-[130px]">
                    {userName}
                  </div>
                  <div className="text-[10px] text-text-secondary truncate max-w-[130px]">
                    {userEmail}
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform duration-200 ml-auto",
                    isDropdownOpen ? "rotate-180" : "rotate-0"
                  )}
                />
              </div>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="center"
          side="top"
          className={cn(
            "bg-white rounded-xl border border-border-muted shadow-lg p-1.5 gap-1.5 flex flex-col",
            "w-fit min-w-[200px] md:min-w-[243px] max-w-[320px]"
          )}
          sideOffset={8}
          avoidCollisions={true}
        >
          {/* User Info Header */}
          <div className="px-1 h-12.5 flex gap-2 items-center">
            <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center shrink-0">
              <span className="text-white text-xs font-satoshi-medium">
                {userInitials}
              </span>
            </div>
            <div className="flex-1 gap-px flex flex-col min-w-0">
              <div className="text-sm text-text-primary truncate">
                {userName}
              </div>
              <div className="text-xs text-text-secondary font-satoshi-regular truncate">
                {userEmail}
              </div>
            </div>
          </div>

          <DropdownMenuSeparator className="my-0" />

          <DropdownMenuItem
            onClick={handleManageAccount}
            className="flex items-center gap-2.5 px-1.5 h-8 py-0! cursor-pointer rounded-lg hover:bg-background-muted"
          >
            <Settings2 className="h-5 w-5 text-text-primary" />
            <span className="text-sm text-text-secondary">Manage account</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-0" />

          <DropdownMenuItem
            onClick={handleHelp}
            className="flex items-center gap-2.5 px-1.5 h-8 py-0! cursor-pointer rounded-lg hover:bg-background-muted"
          >
            <LifeBuoy className="h-5 w-5 text-text-primary" />
            <span className="text-sm text-text-secondary">Help</span>
            <ExternalLink className="h-3.5 w-3.5 text-text-tertiary ml-auto" />
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex items-center gap-2.5 px-1.5 h-8 py-0! cursor-pointer rounded-lg text-red-600! hover:bg-red-50 focus:bg-red-50 data-[highlighted]:bg-red-50"
          >
            {isLoggingOut ? (
              <Loader2 className="h-5 w-5 text-error animate-spin" />
            ) : (
              <LogOut className="h-5 w-5 text-error" />
            )}
            <span className="text-sm text-error">
              {isLoggingOut ? "Logging out..." : "Logout"}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
