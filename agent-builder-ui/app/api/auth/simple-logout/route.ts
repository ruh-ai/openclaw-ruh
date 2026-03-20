import { NextResponse } from "next/server";

// Simple logout — clears the auth cookie
export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set("agent-builder-auth", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
