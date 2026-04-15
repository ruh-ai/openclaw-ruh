import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CodeZero2Pi | We Engineer Intelligence",
  description:
    "We build AI agents and custom software that automate workflows, accelerate operations, and scale your business. From concept to deployment in weeks.",
  keywords: [
    "AI agents",
    "custom software development",
    "automation",
    "agentic AI",
    "enterprise software",
    "AI consulting",
    "workflow automation",
  ],
  openGraph: {
    title: "CodeZero2Pi | We Engineer Intelligence",
    description:
      "AI agents and custom software that work as hard as you do. From concept to deployment in weeks.",
    url: "https://codezero2pi.com",
    siteName: "CodeZero2Pi",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="font-body bg-brand-bg text-brand-text antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
