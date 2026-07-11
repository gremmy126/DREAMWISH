import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  approveCandidate,
  MemoryLifecycleError
} from "@/src/lib/memory/memory-lifecycle";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: number;
      content?: string;
      note?: string | null;
    };
    const memory = await approveCandidate(owner.uid, id, {
      expectedVersion: body.expectedVersion as number,
      content: body.content,
      note: body.note
    });
    return NextResponse.json({ memory });
  } catch (error) {
    const status =
      error instanceof MemoryLifecycleError || error instanceof OwnerContextError
        ? error.status
        : 500;
    const code =
      error instanceof MemoryLifecycleError || error instanceof OwnerContextError
        ? error.code
        : "MEMORY_APPROVAL_FAILED";
    return NextResponse.json(
      { error: { code, message: error instanceof Error ? error.message : "Approval failed" } },
      { status }
    );
  }
}
