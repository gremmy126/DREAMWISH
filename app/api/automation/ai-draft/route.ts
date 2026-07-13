import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildScenarioFromPrompt } from "@/src/lib/automation/scenario-designer";
import { saveScenario } from "@/src/lib/automation/scenario.repository";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { prompt?: string };
  if (!body.prompt?.trim()) return NextResponse.json({ error: "자동화 명령을 입력하세요." }, { status: 400 });
  const scenario = await saveScenario(owner.uid, buildScenarioFromPrompt(body.prompt, owner.uid));
  return NextResponse.json({ scenario }, { status: 201 });
}
