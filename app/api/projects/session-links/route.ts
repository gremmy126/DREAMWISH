import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  assignSessionToProject,
  listProjectSessionLinks,
  ProjectSessionLinkNotFoundError
} from "@/src/lib/projects/project.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ sessionLinks: await listProjectSessionLinks(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: string;
    sessionId?: string;
  };
  if (!body.projectId || !body.sessionId) {
    return NextResponse.json(
      { error: "projectId와 sessionId가 필요합니다." },
      { status: 400 }
    );
  }
  try {
    const link = await assignSessionToProject({
      ownerId: owner.uid,
      projectId: body.projectId,
      sessionId: body.sessionId
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectSessionLinkNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
