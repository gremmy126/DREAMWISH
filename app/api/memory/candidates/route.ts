import { NextResponse } from "next/server";
import {
  createMemoryCandidate,
  listMemoryCandidates
} from "@/src/lib/memory/memory-engine";
import type { MemorySignal, MemorySource, MemoryStatus } from "@/src/lib/memory/memory.types";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = asStatus(url.searchParams.get("status"));
  const projectId = url.searchParams.has("projectId")
    ? url.searchParams.get("projectId")
    : undefined;
  return NextResponse.json({
    candidates: await listMemoryCandidates({ status, projectId })
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    source?: MemorySource;
    content?: string;
    signals?: MemorySignal[];
    projectId?: string | null;
    sourceId?: string | null;
    title?: string;
    preview?: string;
    importance?: number;
    confidence?: number;
  };
  const candidate = await createMemoryCandidate({
    source: body.source || "manual",
    content: body.content || "",
    signals: Array.isArray(body.signals) ? body.signals : undefined,
    projectId: body.projectId || null,
    sourceId: body.sourceId || null,
    title: body.title,
    preview: body.preview,
    importance: body.importance,
    confidence: body.confidence
  });
  return NextResponse.json({ candidate }, { status: 201 });
}

function asStatus(value: string | null): MemoryStatus | undefined {
  if (value === "pending" || value === "approved" || value === "rejected") return value;
  return undefined;
}
