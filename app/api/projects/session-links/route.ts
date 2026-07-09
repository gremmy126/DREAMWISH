import { NextResponse } from "next/server";
import {
  assignSessionToProject,
  listProjectSessionLinks
} from "@/src/lib/projects/project.repository";

export async function GET() {
  return NextResponse.json({ sessionLinks: await listProjectSessionLinks() });
}

export async function POST(request: Request) {
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
  const link = await assignSessionToProject({
    projectId: body.projectId,
    sessionId: body.sessionId
  });
  return NextResponse.json({ link }, { status: 201 });
}
