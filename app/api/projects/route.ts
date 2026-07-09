import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/src/lib/projects/project.repository";

export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const project = await createProject({ name: body.name || "" });
  return NextResponse.json({ project }, { status: 201 });
}
