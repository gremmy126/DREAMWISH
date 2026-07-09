import { NextResponse } from "next/server";
import { captureExternalMemoryCandidate } from "@/src/lib/memory/external-memory-capture";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    connectorId?: string;
    sourceId?: string;
    title?: string;
    content?: string;
    preview?: string;
    projectId?: string | null;
  };
  const candidate = await captureExternalMemoryCandidate({
    connectorId: body.connectorId || "manual",
    sourceId: body.sourceId || crypto.randomUUID(),
    title: body.title || "External memory candidate",
    content: body.content || "",
    preview: body.preview || "",
    projectId: body.projectId || null
  });
  return NextResponse.json({ candidate }, { status: 201 });
}
