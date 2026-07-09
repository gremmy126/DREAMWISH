import { NextResponse } from "next/server";
import { buildMemoryDashboardSnapshot } from "@/src/lib/memory/memory-engine";

export async function GET() {
  return NextResponse.json(await buildMemoryDashboardSnapshot());
}
