import type { Metadata } from "next";
import { generateCanonicalMetadata } from "@/lib/utils/canonical";

// Metadata for authentication pages
export const metadata: Metadata = {
  title: "Authentication",
  description:
    "Log in to Ruh OpenClaw Developer platform. Build and manage your developer tools.",
  ...generateCanonicalMetadata("/authenticate"),
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
