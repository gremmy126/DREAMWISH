import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listKnowledgeNotes } from "@/src/lib/knowledge/knowledge.repository";
import { buildMemoryDashboardSnapshot } from "@/src/lib/memory/memory-engine";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const [snapshot, notes] = await Promise.all([
    buildMemoryDashboardSnapshot(owner.uid),
    listKnowledgeNotes(owner.uid)
  ]);
  return NextResponse.json({
    graph: snapshot.knowledgeNetwork,
    timeline: snapshot.timeline,
    recentMemory: snapshot.recentMemory,
    notes,
    statistics: snapshot.statistics
  });
}
