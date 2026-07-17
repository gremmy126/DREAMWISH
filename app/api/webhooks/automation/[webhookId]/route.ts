import { NextResponse } from "next/server";
import { recordAutomationRun } from "@/src/lib/automation/run.repository";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import {
  findAutomationWebhookById,
  recordWebhookDelivery,
  verifyWebhookSecret
} from "@/src/lib/automation/webhook.repository";
import { executeScenarioGraph } from "@/src/lib/automation/workflow-engine";
import { getVerifiedConnectionStates } from "@/src/lib/integrations/verified-connection.service";

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT_PER_MINUTE = 60;
const rateWindow = new Map<string, { minute: number; count: number }>();

type Context = { params: Promise<{ webhookId: string }> };

/**
 * Custom automation webhook receiver: authenticated by the per-webhook
 * secret (X-Webhook-Secret header or sha256 HMAC in X-Signature-256),
 * idempotent on X-Event-Id, rate-limited, and answers fast — the workflow
 * run is recorded durably and external sends stay approval-gated.
 */
export async function POST(request: Request, context: Context) {
  const { webhookId } = await context.params;
  const webhook = await findAutomationWebhookById(webhookId);
  if (!webhook || !webhook.active) {
    return NextResponse.json({ accepted: false, error: "unknown_webhook" }, { status: 404 });
  }

  const minute = Math.floor(Date.now() / 60_000);
  const window = rateWindow.get(webhookId);
  if (window && window.minute === minute && window.count >= RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json({ accepted: false, error: "rate_limited" }, { status: 429 });
  }
  rateWindow.set(webhookId, {
    minute,
    count: window && window.minute === minute ? window.count + 1 : 1
  });

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ accepted: false, error: "payload_too_large" }, { status: 413 });
  }

  const authorized = verifyWebhookSecret(webhook, {
    secretHeader: request.headers.get("x-webhook-secret"),
    signatureHeader: request.headers.get("x-signature-256"),
    rawBody
  });
  if (!authorized) {
    return NextResponse.json({ accepted: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: Record<string, unknown> = {};
  if (rawBody.trim()) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      payload = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : { value: parsed };
    } catch {
      payload = { raw: rawBody.slice(0, 10_000) };
    }
  }

  const externalEventId =
    request.headers.get("x-event-id") ||
    (typeof payload.eventId === "string" ? payload.eventId : null);
  const fresh = await recordWebhookDelivery(webhookId, externalEventId);
  if (!fresh) {
    return NextResponse.json({ accepted: true, duplicate: true }, { status: 200 });
  }

  const scenario = await getScenario(webhook.ownerId, webhook.scenarioId);
  if (!scenario || scenario.status !== "active") {
    return NextResponse.json(
      { accepted: false, error: "workflow_inactive" },
      { status: 409 }
    );
  }

  const connectedApps = new Set<string>();
  try {
    for (const connection of await getVerifiedConnectionStates(webhook.ownerId)) {
      if (connection.status === "connected") connectedApps.add(connection.connectorId);
    }
  } catch {
    // Reduced detail only.
  }

  const startedAt = new Date().toISOString();
  const result = executeScenarioGraph(scenario, { triggerData: payload, connectedApps });
  const run = await recordAutomationRun({
    ownerId: webhook.ownerId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    trigger: "webhook",
    status: result.status,
    steps: result.steps,
    error: null,
    startedAt,
    finishedAt: new Date().toISOString()
  });

  return NextResponse.json({ accepted: true, executionId: run.id }, { status: 202 });
}
