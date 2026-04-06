import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CustomerSessionGate } from "@/app/_components/CustomerSessionGate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruh Workspace",
  description: "Open installed digital employees inside dedicated customer workspaces",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CustomerSessionGate>{children}</CustomerSessionGate>
      </body>
    </html>
  );
}
