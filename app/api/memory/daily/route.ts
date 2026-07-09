import { NextResponse } from "next/server";
import { generateDailyMemoryBrief } from "@/src/lib/memory/memory-engine";

export async function GET(request: Request) {
  const url = new URL(request.url);
  return NextResponse.json({
    brief: await generateDailyMemoryBrief({ date: url.searchParams.get("date") || undefined })
  });
}
