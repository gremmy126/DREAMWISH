import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production"
  });
  return response;
}
