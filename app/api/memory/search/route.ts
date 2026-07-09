import { NextResponse } from "next/server";
import { deepThinkSearch, quickMemorySearch } from "@/src/lib/memory/memory-search";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    query?: string;
    mode?: "quick" | "deep";
    projectId?: string | null;
  };
  const query = body.query || "";
  if (body.mode === "deep") {
    return NextResponse.json(await deepThinkSearch(query, { projectId: body.projectId || null }));
  }
  return NextResponse.json(await quickMemorySearch(query, { projectId: body.projectId || null }));
}
