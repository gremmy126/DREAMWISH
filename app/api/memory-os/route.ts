import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  buildOverview,
  createMemoryOsItem,
  findRelated,
  listMemoryOs,
  searchScore,
  syncDerivedMemories
} from "@/src/lib/memory-os/memory-os.service";
import { isMemoryOsStatus, isMemoryOsType, relevanceStars } from "@/src/lib/memory-os/memory-os.types";

// Memory OS listing: syncs derived memories (decisions, research, outcomes,
// legacy memories) then returns filtered/scored items plus the overview.
export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  try {
    // Derivation must never take the listing down (e.g. a temporarily
    // unreachable database for one source).
    await syncDerivedMemories(owner.uid);
  } catch {
    // Items already stored still render; the next request retries the sync.
  }
  const state = await listMemoryOs(owner.uid);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const favorite = url.searchParams.get("favorite") === "1";
  const sort = url.searchParams.get("sort") || "latest";

  const active = state.items.filter((item) => item.status !== "expired");
  let items = active.filter((item) => {
    if (isMemoryOsType(type) && item.type !== type) return false;
    if (isMemoryOsStatus(status) && item.status !== status) return false;
    if (!status && item.status === "archived") return false;
    if (favorite && !item.favorite) return false;
    return true;
  });

  if (query) {
    items = items
      .map((item) => ({ item, score: searchScore(item, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.item);
  } else if (sort === "usage") {
    items = [...items].sort((a, b) => b.usageCount - a.usageCount);
  } else if (sort === "confidence") {
    items = [...items].sort((a, b) => b.confidence - a.confidence);
  } else {
    items = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const enriched = items.map((item) => {
    const relatedCount = findRelated(item, active, 12).length;
    return {
      ...item,
      content: undefined,
      versions: undefined,
      relatedCount,
      stars: relevanceStars(relatedCount, item.importance)
    };
  });

  return NextResponse.json({ items: enriched, overview: buildOverview(active) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const item = await createMemoryOsItem(owner.uid, body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "메모리를 만들지 못했습니다." },
      { status: 400 }
    );
  }
}
