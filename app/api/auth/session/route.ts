import { NextResponse } from "next/server";
import { getAccountAccess } from "@/src/lib/auth/account.repository";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      idToken?: string;
    };
    const verified = body.idToken ? await verifyFirebaseIdToken(body.idToken) : null;
    const access = await getAccountAccess(verified?.email || String(body.email || ""));

    if (!access) {
      return NextResponse.json({ ok: false, access: null }, { status: 401 });
    }

    return NextResponse.json({ ok: true, access });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: stringifyUnknownError(error) },
      { status: 400 }
    );
  }
}
