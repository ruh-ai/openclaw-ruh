import type { Metadata } from "next";
import { Jost, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Hermes Mission Control",
  description: "Self-evolving orchestrator dashboard for openclaw-ruh-enterprise",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${jost.variable} antialiased min-h-screen`}>{children}</body>
    </html>
  );
}
