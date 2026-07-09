import { NextResponse } from "next/server";
import { listSyncHistory } from "@/src/lib/repositories/sync-history.repository";

export async function GET() {
  return NextResponse.json({ history: await listSyncHistory() });
}
