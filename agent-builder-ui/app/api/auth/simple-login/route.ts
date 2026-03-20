import { NextRequest, NextResponse } from "next/server";

// Simple password-based login for development/demo
// TODO: Replace with proper auth when ready

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    if (password !== process.env.SIMPLE_LOGIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const response = NextResponse.json({ success: true });

    // Set a simple auth cookie (7 days)
    response.cookies.set("agent-builder-auth", "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
