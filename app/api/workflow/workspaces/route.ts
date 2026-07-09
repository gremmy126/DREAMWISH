import { NextResponse } from "next/server";
import {
  createWorkflowWorkspace,
  listWorkflowWorkspaces
} from "@/src/lib/workflow/workflow.repository";

export async function GET() {
  return NextResponse.json({ workspaces: await listWorkflowWorkspaces() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    triggerType?: string;
  };
  const workspace = await createWorkflowWorkspace({
    name: body.name || "",
    description: body.description,
    triggerType: body.triggerType || "manual"
  });
  return NextResponse.json({ workspace }, { status: 201 });
}
