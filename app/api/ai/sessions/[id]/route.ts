import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { archiveSession, getSession } from "@/src/lib/db/repositories/chat.repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { id } = await context.params;
  const session = await getSession(owner.uid, id);

  if (!session) {
    return NextResponse.json({ error: "채팅 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function DELETE(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { id } = await context.params;
  const archived = await archiveSession(owner.uid, id);

  if (!archived) {
    return NextResponse.json({ error: "채팅 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
