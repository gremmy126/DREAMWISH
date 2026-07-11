import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  correctApprovedMemory,
  forgetApprovedMemory,
  MemoryLifecycleError
} from "@/src/lib/memory/memory-lifecycle";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: number;
      content?: string;
    };
    const memory = await correctApprovedMemory(owner.uid, id, {
      expectedVersion: body.expectedVersion as number,
      content: body.content || ""
    });
    return NextResponse.json({ memory });
  } catch (error) {
    return lifecycleError(error, "MEMORY_CORRECTION_FAILED");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      expectedVersion?: number;
    };
    const memory = await forgetApprovedMemory(owner.uid, id, {
      expectedVersion: body.expectedVersion as number
    });
    return NextResponse.json({ memory });
  } catch (error) {
    return lifecycleError(error, "MEMORY_FORGET_FAILED");
  }
}

function lifecycleError(error: unknown, fallbackCode: string) {
  const known = error instanceof MemoryLifecycleError || error instanceof OwnerContextError;
  return NextResponse.json(
    {
      error: {
        code: known ? error.code : fallbackCode,
        message: error instanceof Error ? error.message : "Memory transition failed"
      }
    },
    { status: known ? error.status : 500 }
  );
}
