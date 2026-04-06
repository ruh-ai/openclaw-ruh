import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruh Admin",
  description: "Ruh.ai Platform Administration",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/assets/logos/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg-default)] text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}
