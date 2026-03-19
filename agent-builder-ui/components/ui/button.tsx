import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[6px] text-sm font-satoshi-bold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none cursor-pointer",
  {
    variants: {
      variant: {
        // Primary - Purple background with white text
        primary:
          "bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-hover)] disabled:bg-[var(--disabled)] disabled:text-white ",

        // Secondary - White background with purple border and text
        secondary:
          "bg-[var(--card-color)] text-[var(--primary)] border border-[var(--primary)] hover:bg-[var(--color-light)] disabled:bg-disabled disabled:text-white disabled:border-0",

        // Tertiary - Gray background with dark text
        tertiary:
          "bg-[var(--card-color)] text-[var(--text-secondary)] border border-border-muted hover:text-[var(--text-primary)]  hover:bg-[var(--card-color)]  disabled:bg-[var(--disabled)] disabled:text-white disabled:border-0",

        // Ghost - Transparent background with purple text
        ghost:
          "bg-transparent text-[var(--primary)] hover:bg-transparent hover:text-[var(--primary-hover)]  border-0  disabled:text-[var(--disabled)]",

        // Link - Blue text with underline
        link: "bg-transparent text-[var(--secondary)] hover:bg-transparent hover:text-[var(--secondary-hover)]  border-0  disabled:text-[var(--disabled)]",

        // Link Secondary - Gray text with underline
        linkSecondary:
          "bg-transparent text-[var(--text-secondary)] hover:bg-transparent hover:text-[var(--text-secondary)]  border-0  disabled:text-[var(--disabled)]",

        // Gradient - Purple gradient background with white text
        gradient:
          "bg-gradient-to-r from-[var(--primary)] to-[var(--secondary)] text-white   hover:from-[var(--primary-hover)] hover:to-[var(--secondary-hover)]    disabled:from-[var(--disabled)] disabled:to-[var(--disabled)] disabled:text-white",

        // Destructive - Red background for destructive actions
        destructive:
          "bg-[var(--error)] text-white shadow-sm hover:bg-[var(--error)]/90 focus-visible:ring-2 focus-visible:ring-[var(--error)] focus-visible:ring-offset-2 disabled:bg-[var(--disabled)] disabled:text-white",

        // Outline - Border with background on hover
        outline:
          "border border-[var(--border-default)] bg-[var(--background)] shadow-sm hover:bg-[var(--background-muted)] hover:text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--border-default)] focus-visible:ring-offset-2 disabled:bg-[var(--background)] disabled:text-[var(--disabled)] disabled:border-[var(--disabled)]",

        icon: "border border-[var(--border-default)] bg-transparent text-[var(--text-secondary)] shadow-sm hover:bg-[var(--user-bubble)] hover:text-[var(--text-primary)] disabled:bg-[var(--background)] disabled:text-[var(--disabled)] disabled:border-[var(--disabled)] disabled:pointer-events-auto disabled:cursor-not-allowed",

        // Legacy variants for backward compatibility
        default:
          "bg-[var(--primary)] text-white shadow-sm hover:bg-[var(--primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 disabled:bg-[var(--disabled)] disabled:text-white",
      },
      size: {
        default: "h-10 px-3 py-[10px] has-[>svg]:px-3",
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-12 rounded-lg px-6 has-[>svg]:px-4",
        icon: "h-8 w-8 p-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
