import { NextResponse } from "next/server";
import {
  createAutomationDraft,
  listAutomations
} from "@/src/lib/automation/automation.repository";

export async function GET() {
  return NextResponse.json({ automations: await listAutomations() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    trigger?: string;
    action?: string;
  };
  const automation = await createAutomationDraft({
    name: body.name || "",
    trigger: body.trigger || "",
    action: body.action || ""
  });
  return NextResponse.json({ automation }, { status: 201 });
}
