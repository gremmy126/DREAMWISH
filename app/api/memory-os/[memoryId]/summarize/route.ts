import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { summarizeMemory } from "@/src/lib/memory-os/memory-os-summary";
import {
  listMemoryOs,
  updateMemoryOsItem
} from "@/src/lib/memory-os/memory-os.service";

type RouteContext = { params: Promise<{ memoryId: string }> };

// Generates the AI Summary (3줄 요약 · 핵심 결과 · 주의할 점 · 다음 사용).
// Falls back to a deterministic summary, so the panel always completes.
export async function POST(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { memoryId } = await context.params;
  const state = await listMemoryOs(owner.uid);
  const item = state.items.find((candidate) => candidate.id === memoryId);
  if (!item) {
    return NextResponse.json({ error: "메모리를 찾을 수 없습니다." }, { status: 404 });
  }
  const summary = await summarizeMemory(item);
  const updated = await updateMemoryOsItem(owner.uid, memoryId, { aiSummary: summary });
  return NextResponse.json({ item: updated, summary });
}
