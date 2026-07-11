import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { generateDailyMemoryBrief } from "@/src/lib/memory/memory-engine";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    return NextResponse.json({
      brief: await generateDailyMemoryBrief(owner.uid, { date: url.searchParams.get("date") || undefined })
    });
  } catch (error) {
    const known = error instanceof OwnerContextError;
    return NextResponse.json(
      { error: { code: known ? error.code : "MEMORY_DAILY_FAILED", message: error instanceof Error ? error.message : "Daily brief failed" } },
      { status: known ? error.status : 500 }
    );
  }
}
