import { NextResponse } from "next/server";
import { approveMemoryCandidate } from "@/src/lib/memory/memory-engine";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    approvedBy?: string;
    note?: string | null;
  };
  try {
    const memory = await approveMemoryCandidate(id, {
      approvedBy: body.approvedBy || "user",
      note: body.note || null
    });
    return NextResponse.json({ memory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Approval failed" },
      { status: 404 }
    );
  }
}
