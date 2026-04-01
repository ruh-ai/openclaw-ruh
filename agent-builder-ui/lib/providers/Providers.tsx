"use client";

import React from "react";
import { Toaster } from "sonner";
import QueryProvider from "./QueryProvider";
import { SessionInitializationWrapper } from "@/components/auth/SessionInitializationWrapper";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <Toaster />
      <SessionInitializationWrapper>{children}</SessionInitializationWrapper>
    </QueryProvider>
  );
}
