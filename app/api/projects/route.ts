import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createProject, listProjects } from "@/src/lib/projects/project.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ projects: await listProjects(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const project = await createProject({ ownerId: owner.uid, name: body.name || "" });
  return NextResponse.json({ project }, { status: 201 });
}
