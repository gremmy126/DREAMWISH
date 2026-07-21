import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getTeamIntelligence } from "@/src/lib/team/team-intelligence";

// 조직 인텔리전스 — 익명 집계·신호·회의 메타데이터만 사용한다.
export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const intelligence = await getTeamIntelligence(owner.uid);
  return NextResponse.json({ intelligence });
}
