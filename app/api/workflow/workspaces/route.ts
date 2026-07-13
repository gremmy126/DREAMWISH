import { NextResponse } from "next/server";
import {
  createWorkflowWorkspace,
  listWorkflowWorkspaces
} from "@/src/lib/workflow/workflow.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ workspaces: await listWorkflowWorkspaces(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    triggerType?: string;
  };
  const workspace = await createWorkflowWorkspace({
    ownerId: owner.uid,
    name: body.name || "",
    description: body.description,
    triggerType: body.triggerType || "manual"
  });
  return NextResponse.json({ workspace }, { status: 201 });
}
