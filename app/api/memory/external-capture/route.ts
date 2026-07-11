import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { captureExternalMemoryCandidate } from "@/src/lib/memory/external-memory-capture";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      connectorId?: string;
      sourceId?: string;
      title?: string;
      content?: string;
      preview?: string;
      projectId?: string | null;
    };
    const candidate = await captureExternalMemoryCandidate({
      ownerId: owner.uid,
      connectorId: body.connectorId || "manual",
      sourceId: body.sourceId || crypto.randomUUID(),
      title: body.title || "External memory candidate",
      content: body.content || "",
      preview: body.preview || "",
      projectId: body.projectId || null
    });
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    const known = error instanceof OwnerContextError;
    return NextResponse.json(
      { error: { code: known ? error.code : "EXTERNAL_MEMORY_CAPTURE_FAILED", message: error instanceof Error ? error.message : "External capture failed" } },
      { status: known ? error.status : 500 }
    );
  }
}
