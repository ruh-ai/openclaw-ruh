import type { Metadata } from "next";
import "./globals.css";

import { siteConfig } from "@/shared/site.config";
import { ruhFaviconIcon } from "@/shared/constants";
import { Providers } from "@/lib/providers/Providers";
import { generateCanonicalMetadata } from "@/lib/utils/canonical";
import RobotsMetaTag from "@/components/shared/RobotsMetaTag";

// Metadata for the website
export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: [
    {
      rel: "icon",
      type: "image/x-icon",
      url: "/favicon.ico",
    },
    {
      rel: "icon",
      type: "image/svg+xml",
      url: ruhFaviconIcon,
    },
    {
      rel: "apple-touch-icon",
      sizes: "180x180",
      url: "/apple-touch-icon.png",
    },
  ],
  manifest: "/site.webmanifest",
  keywords: [
    "AI",
    "developer",
    "OpenClaw",
    "platform",
    "ruh",
  ],
  authors: [{ name: "Ruh AI" }],
  creator: "Ruh AI",
  publisher: "Ruh AI",
  robots: {
    index: true,
    follow: true,
  },
  ...generateCanonicalMetadata("/"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="antialiased">
      <head>
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <meta name="msapplication-TileColor" content="#ae00d0" />
        <meta name="theme-color" content="#ae00d0" />
        <RobotsMetaTag />
      </head>
      <body className="font-satoshi-medium bg-white text-text-primary relative">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
