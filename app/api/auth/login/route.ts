import { NextResponse } from "next/server";
import { loginAccount } from "@/src/lib/auth/account.repository";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      name?: string;
      idToken?: string;
    };
    const verified = body.idToken ? await verifyFirebaseIdToken(body.idToken) : null;
    const result = await loginAccount({
      email: verified?.email || String(body.email || ""),
      name: verified?.name || body.name || null
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: stringifyUnknownError(error) },
      { status: 400 }
    );
  }
}
