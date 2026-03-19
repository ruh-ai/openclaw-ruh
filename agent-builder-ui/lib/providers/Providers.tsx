"use client";

import React from "react";
import { Toaster } from "sonner";
import QueryProvider from "./QueryProvider";
import { ThemeProvider } from "./ThemeProvider";
import { SessionInitializationWrapper } from "@/components/auth/SessionInitializationWrapper";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      themes={["light"]}
      disableTransitionOnChange
    >
      <QueryProvider>
        <Toaster />
        <SessionInitializationWrapper>{children}</SessionInitializationWrapper>
      </QueryProvider>
    </ThemeProvider>
  );
}
