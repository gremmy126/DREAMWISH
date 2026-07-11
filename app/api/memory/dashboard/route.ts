import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildMemoryDashboardSnapshot } from "@/src/lib/memory/memory-engine";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    return NextResponse.json(await buildMemoryDashboardSnapshot(owner.uid));
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const known = error instanceof OwnerContextError;
  return NextResponse.json(
    { error: { code: known ? error.code : "MEMORY_DASHBOARD_FAILED", message: error instanceof Error ? error.message : "Dashboard failed" } },
    { status: known ? error.status : 500 }
  );
}
