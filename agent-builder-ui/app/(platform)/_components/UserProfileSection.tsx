"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { loginRoute } from "@/shared/routes";
// TODO: Re-enable when external auth is restored
// import { useUserStore } from "@/hooks/use-user";
// import { authApi } from "@/app/api/auth";
import {
  ChevronDown,
  Loader2,
  LogOut,
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
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Simple static user for now — no user store needed
  const userName = "Developer";
  const userEmail = "dev@ruh.ai";
  const userInitials = "DE";

  // Simple logout — just clear the auth cookie
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/simple-logout", { method: "POST" });
      router.push(loginRoute);
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Logout failed. Redirecting to login...");
      router.push(loginRoute);
    } finally {
      setIsLoggingOut(false);
      onClose?.();
    }
  };

  /* Original logout using external auth:
   * const handleLogout = async () => {
   *   setIsLoggingOut(true);
   *   try {
   *     await authApi.logout();
   *     router.push(loginRoute);
   *   } catch (error) {
   *     console.error("Logout error:", error);
   *     toast.error("Logout failed. Redirecting to login...");
   *     router.push(loginRoute);
   *   } finally {
   *     setIsLoggingOut(false);
   *     onClose?.();
   *   }
   * };
   */

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
