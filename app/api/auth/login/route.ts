import { NextResponse } from "next/server";
import { loginAccount } from "@/src/lib/auth/account.repository";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";
import { AIProviderError } from "@/src/lib/ai/errors";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
    };
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: "Firebase ID token is required." },
        { status: 401 }
      );
    }

    const verified = await verifyFirebaseIdToken(idToken);
    const result = await loginAccount({
      email: verified.email,
      name: verified.name
    });
    const sessionToken = await createSessionToken({
      uid: verified.uid,
      email: verified.email,
      name: verified.name,
      paid: result.access.paid
    });
    const response = NextResponse.json({ ok: true, ...result });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production"
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: stringifyUnknownError(error) },
      { status: error instanceof AIProviderError && error.status === 401 ? 401 : 500 }
    );
  }
}
