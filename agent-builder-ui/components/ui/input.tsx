import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-sm border-1 border-gray-200 bg-brand-card px-3 py-[20px] text-lg shadow-xs outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 hover:border-brand-primary transition-colors duration-[700ms]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive text-brand-primary-font font-normal placeholder:text-brand-secondary-font",
        className
      )}
      {...props}
    />
  );
}

export { Input };
