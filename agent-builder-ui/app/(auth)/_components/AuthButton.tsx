"use client";

import { useSearchParams } from "next/navigation";
import { PrimaryButton } from "@/components/shared/PrimaryButton";
import { useRouter } from "next/navigation";

export const AuthButton = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("token");
  const redirectUrl = searchParams.get("redirect_url");

  const handleLogin = () => {
    const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const fullRedirectUrl = redirectUrl
      ? `${baseAppUrl}${redirectUrl}`
      : baseAppUrl;

    const authUrl = new URL(process.env.NEXT_PUBLIC_AUTH_URL || "");
    authUrl.searchParams.set("redirect_url", fullRedirectUrl);

    if (inviteToken) {
      authUrl.searchParams.set("invitedToken", inviteToken);
    }

    router.push(authUrl.toString());
  };

  return (
    <div>
      <PrimaryButton onClick={handleLogin} className="w-full">
        Login
      </PrimaryButton>
    </div>
  );
};
