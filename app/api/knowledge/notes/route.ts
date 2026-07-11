import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  buildKnowledgeGraph,
  createKnowledgeNote,
  listKnowledgeNotes
} from "@/src/lib/knowledge/knowledge.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const projectId = url.searchParams.has("projectId")
    ? url.searchParams.get("projectId")
    : undefined;
  const notes = await listKnowledgeNotes(owner.uid, projectId);
  return NextResponse.json({ notes, graph: buildKnowledgeGraph(notes) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    tags?: string[];
    projectId?: string | null;
    sourceFileId?: string | null;
  };
  const note = await createKnowledgeNote({
    ownerId: owner.uid,
    title: body.title || "",
    body: body.body || "",
    tags: body.tags || [],
    projectId: body.projectId || null,
    sourceFileId: body.sourceFileId || null
  });
  return NextResponse.json({ note }, { status: 201 });
}
