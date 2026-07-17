import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import {
  createAutomationWebhook,
  listAutomationWebhooks,
  setAutomationWebhookActive
} from "@/src/lib/automation/webhook.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const scenarioId = new URL(request.url).searchParams.get("scenarioId") || undefined;
  return NextResponse.json({ webhooks: await listAutomationWebhooks(owner.uid, scenarioId) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { scenarioId?: unknown };
  const scenarioId = typeof body.scenarioId === "string" ? body.scenarioId : "";
  if (!scenarioId || !(await getScenario(owner.uid, scenarioId))) {
    return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
  }
  const webhook = await createAutomationWebhook(owner.uid, scenarioId);
  return NextResponse.json({ webhook }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    webhookId?: unknown;
    active?: unknown;
  };
  const webhookId = typeof body.webhookId === "string" ? body.webhookId : "";
  if (!webhookId || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "webhookId와 active가 필요합니다." }, { status: 400 });
  }
  const webhook = await setAutomationWebhookActive(owner.uid, webhookId, body.active);
  if (!webhook) return NextResponse.json({ error: "웹훅을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ webhook });
}
