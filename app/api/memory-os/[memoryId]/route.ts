import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  deleteMemoryOsItem,
  findRelated,
  listMemoryOs,
  updateMemoryOsItem
} from "@/src/lib/memory-os/memory-os.service";
import { relevanceStars } from "@/src/lib/memory-os/memory-os.types";

type RouteContext = { params: Promise<{ memoryId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { memoryId } = await context.params;
  const state = await listMemoryOs(owner.uid);
  const item = state.items.find((candidate) => candidate.id === memoryId);
  if (!item) {
    return NextResponse.json({ error: "메모리를 찾을 수 없습니다." }, { status: 404 });
  }
  // Opening a detail counts as usage — feeds the Memory Insight section.
  await updateMemoryOsItem(owner.uid, memoryId, { recordUsage: true });
  const related = findRelated(item, state.items).map((entry) => ({
    id: entry.item.id,
    title: entry.item.title,
    type: entry.item.type,
    status: entry.item.status,
    project: entry.item.project,
    score: entry.score
  }));
  return NextResponse.json({
    item,
    related,
    relatedCount: related.length,
    stars: relevanceStars(related.length, item.importance)
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { memoryId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const item = await updateMemoryOsItem(owner.uid, memoryId, body);
  if (!item) {
    return NextResponse.json({ error: "메모리를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ item });
}

export async function DELETE(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { memoryId } = await context.params;
  const deleted = await deleteMemoryOsItem(owner.uid, memoryId);
  if (!deleted) {
    return NextResponse.json({ error: "메모리를 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
