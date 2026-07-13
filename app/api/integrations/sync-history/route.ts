import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listSyncHistory } from "@/src/lib/repositories/sync-history.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ history: await listSyncHistory(owner.uid) });
}
