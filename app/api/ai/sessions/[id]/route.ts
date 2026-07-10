import { NextResponse } from "next/server";
import { archiveSession, getSession } from "@/src/lib/db/repositories/chat.repository";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await getSession(id);

  if (!session) {
    return NextResponse.json({ error: "채팅 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(session);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const archived = await archiveSession(id);

  if (!archived) {
    return NextResponse.json({ error: "채팅 세션을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
