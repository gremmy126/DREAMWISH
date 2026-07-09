import { NextResponse } from "next/server";
import { listSessions } from "@/src/lib/db/repositories/chat.repository";

export async function GET() {
  try {
    return NextResponse.json({ sessions: await listSessions() });
  } catch {
    return NextResponse.json(
      { error: "채팅 세션 목록을 불러오지 못했습니다." },
      { status: 500 }
    );
  }
}
