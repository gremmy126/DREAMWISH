import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listSessions } from "@/src/lib/db/repositories/chat.repository";
import { attachUnlinkedResearchJobsToChatSessions } from "@/src/lib/deep-research/research-chat-session";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    await attachUnlinkedResearchJobsToChatSessions(owner.uid);
    return NextResponse.json({ sessions: await listSessions(owner.uid) });
  } catch {
    return NextResponse.json(
      { error: "채팅 세션 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
