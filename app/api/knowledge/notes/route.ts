import { NextResponse } from "next/server";
import {
  buildKnowledgeGraph,
  createKnowledgeNote,
  listKnowledgeNotes
} from "@/src/lib/knowledge/knowledge.repository";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.has("projectId")
    ? url.searchParams.get("projectId")
    : undefined;
  const notes = await listKnowledgeNotes(projectId);
  return NextResponse.json({ notes, graph: buildKnowledgeGraph(notes) });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    body?: string;
    tags?: string[];
    projectId?: string | null;
    sourceFileId?: string | null;
  };
  const note = await createKnowledgeNote({
    title: body.title || "",
    body: body.body || "",
    tags: body.tags || [],
    projectId: body.projectId || null,
    sourceFileId: body.sourceFileId || null
  });
  return NextResponse.json({ note }, { status: 201 });
}
