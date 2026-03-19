"use client";

import { cn } from "@/lib/utils";
import React from "react";
import { Loader2 } from "lucide-react";
import { PrimaryButtonProps } from "@/shared/interfaces";
import { Button } from "@/components/ui/button";

export const PrimaryButton = ({
  children,
  className,
  onClick,
  isLoading,
  disabled,
  type,
}: PrimaryButtonProps) => {
  return (
    <Button
      variant="primary"
      className={cn(className)}
      onClick={onClick}
      disabled={disabled || isLoading}
      type={type}
    >
      {isLoading && (
        <Loader2
          data-testid="loader"
          className="mr-2 h-[32px] w-4 animate-spin"
        />
      )}
      {children}
    </Button>
  );
};
