import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listCredentials, saveCredential } from "@/src/lib/automation/credential.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ credentials: await listCredentials(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { appId?: string; label?: string; secret?: string };
  if (!body.appId || !body.secret) return NextResponse.json({ error: "앱과 API 키를 입력하세요." }, { status: 400 });
  const credential = await saveCredential({ ownerId: owner.uid, appId: body.appId, label: body.label || "", secret: body.secret });
  return NextResponse.json({ credential }, { status: 201 });
}
