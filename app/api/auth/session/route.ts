import { NextResponse } from "next/server";
import { getAccountAccess } from "@/src/lib/auth/account.repository";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const access = await getAccountAccess(String(body.email || ""));

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
