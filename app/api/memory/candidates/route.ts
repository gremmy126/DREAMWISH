import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createMemoryCandidate,
  listMemoryCandidates
} from "@/src/lib/memory/memory-engine";
import type { MemorySignal, MemorySource, MemoryStatus } from "@/src/lib/memory/memory.types";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    const status = asStatus(url.searchParams.get("status"));
    const projectId = url.searchParams.has("projectId")
      ? url.searchParams.get("projectId")
      : undefined;
    return NextResponse.json({
      candidates: await listMemoryCandidates(owner.uid, { status, projectId })
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
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
    const source = body.source || "manual";
    const candidate = await createMemoryCandidate({
      ownerId: owner.uid,
      source,
      content: body.content || "",
      signals: Array.isArray(body.signals) ? body.signals : undefined,
      projectId: body.projectId || null,
      sourceId: body.sourceId?.trim() || `${source}:${randomUUID()}`,
      title: body.title,
      preview: body.preview,
      importance: body.importance,
      confidence: body.confidence
    });
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

function asStatus(value: string | null): MemoryStatus | undefined {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "forgotten") return value;
  return undefined;
}

function routeError(error: unknown) {
  const status = error instanceof OwnerContextError ? 401 : 500;
  const code = error instanceof OwnerContextError ? error.code : "MEMORY_REQUEST_FAILED";
  return NextResponse.json(
    { error: { code, message: error instanceof Error ? error.message : "Memory request failed" } },
    { status }
  );
}
