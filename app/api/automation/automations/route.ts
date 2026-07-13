import { NextResponse } from "next/server";
import {
  createAutomationDraft,
  listAutomations
} from "@/src/lib/automation/automation.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ automations: await listAutomations(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    trigger?: string;
    action?: string;
  };
  const automation = await createAutomationDraft({
    ownerId: owner.uid,
    name: body.name || "",
    trigger: body.trigger || "",
    action: body.action || ""
  });
  return NextResponse.json({ automation }, { status: 201 });
}
