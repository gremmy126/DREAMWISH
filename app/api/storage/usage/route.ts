import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { calculateAccountStorageUsage } from "@/src/lib/storage/account-storage";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json(await calculateAccountStorageUsage(owner.uid), {
    headers: { "Cache-Control": "private, no-store" }
  });
}
