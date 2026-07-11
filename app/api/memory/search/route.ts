import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { deepThinkSearch, quickMemorySearch } from "@/src/lib/memory/memory-search";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      query?: string;
      mode?: "quick" | "deep";
      projectId?: string | null;
    };
    const query = body.query || "";
    if (body.mode === "deep") {
      return NextResponse.json(await deepThinkSearch(query, { ownerId: owner.uid, projectId: body.projectId || null }));
    }
    return NextResponse.json(await quickMemorySearch(query, { ownerId: owner.uid, projectId: body.projectId || null }));
  } catch (error) {
    const known = error instanceof OwnerContextError;
    return NextResponse.json(
      { error: { code: known ? error.code : "MEMORY_SEARCH_FAILED", message: error instanceof Error ? error.message : "Memory search failed" } },
      { status: known ? error.status : 500 }
    );
  }
}
