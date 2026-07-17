import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildScenarioFromPrompt } from "@/src/lib/automation/scenario-designer";
import { saveScenario } from "@/src/lib/automation/scenario.repository";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    prompt?: string;
    title?: string;
    description?: string;
  };
  if (!body.prompt?.trim()) return NextResponse.json({ error: "자동화 명령을 입력하세요." }, { status: 400 });
  const title = body.title?.trim();
  const description = body.description?.trim();
  if (body.title !== undefined && !title) {
    return NextResponse.json({ error: "시나리오 제목을 입력하세요." }, { status: 400 });
  }
  if (title && title.length > 100) {
    return NextResponse.json({ error: "시나리오 제목은 100자 이하로 입력하세요." }, { status: 400 });
  }
  if (description && description.length > 500) {
    return NextResponse.json({ error: "시나리오 설명은 500자 이하로 입력하세요." }, { status: 400 });
  }
  const scenario = await saveScenario(
    owner.uid,
    buildScenarioFromPrompt(body.prompt, owner.uid, { title, description })
  );
  return NextResponse.json({ scenario }, { status: 201 });
}
