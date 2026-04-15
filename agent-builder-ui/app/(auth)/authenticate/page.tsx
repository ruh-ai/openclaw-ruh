import { Suspense } from "react";
import type { Metadata } from "next";
import { Logo } from "@/components/shared/Logo";
import { ImageCarousel } from "../_components/ImageCarousel";
import { AuthButton } from "../_components/AuthButton";
import { LocalAuthForm } from "../_components/LocalAuthForm";
import { generateCanonicalMetadata } from "@/lib/utils/canonical";
import { resolveAuthMode } from "../auth-mode";

// Metadata for the login page
export const metadata: Metadata = {
  title: "Log In & Start Building",
  description:
    "Log in to Ruh OpenClaw Developer platform. Build and manage your developer tools with AI.",
  ...generateCanonicalMetadata("/authenticate"),
};

const LoginPage = () => {
  const authMode = resolveAuthMode(process.env.NEXT_PUBLIC_AUTH_URL);

  return (
    <div className="min-h-screen flex md:flex-row">
      {/* Left Side - Login Form */}
      <div className="w-full lg:w-1/2 p-8 md:p-12 lg:p-16 flex flex-col justify-between bg-brand-overlay border-r border-gray-200/90 dark:border-brand-card rounded-r-xl">
        <div className="flex flex-col items-center justify-center gap-6 flex-1">
          <div>
            <Logo />
          </div>

          <div className="max-w-md w-full flex flex-col justify-center gap-6">
            <div className="flex flex-col justify-center gap-16">
              <div>
                <h1 className="text-2xl font-bold mb-2 text-brand-primary-font text-center font-primary">
                  {authMode === "external"
                    ? "Log In & Start Building"
                    : "Local Login For Testing"}
                </h1>
                <p className="text-brand-secondary-font text-sm text-center">
                  {authMode === "external"
                    ? "OpenClaw Developer Platform — Build, Deploy & Manage Your AI Tools"
                    : "No external auth provider is configured, so this builder is using the local fallback auth path."}
                </p>
              </div>
              <Suspense fallback={<div>Loading...</div>}>
                {authMode === "external" ? <AuthButton /> : <LocalAuthForm />}
              </Suspense>
            </div>
            <p className="mt-6 text-center text-xs text-[#9CA3AF]">Powered by Ruh AI</p>
          </div>
        </div>
      </div>

      {/* Right Side - Image Carousel */}
      <div className="w-full md:w-1/2 hidden lg:block bg-brand-background">
        <div className="h-full flex flex-col justify-between p-8">
          <div className="flex-1 flex items-center justify-center">
            <ImageCarousel />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
