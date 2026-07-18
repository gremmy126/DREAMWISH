import { NextResponse } from "next/server";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import {
  findAutomationWebhookById,
  recordWebhookDelivery,
  verifyGitHubSignature,
  verifySlackSignature,
  verifyWebhookSecret
} from "@/src/lib/automation/webhook.repository";
import { enqueueScenarioExecution } from "@/src/lib/automation/runtime/execution-enqueue.service";
import { randomUUID } from "node:crypto";

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

  const authorized =
    verifyWebhookSecret(webhook, {
      secretHeader: request.headers.get("x-webhook-secret"),
      signatureHeader: request.headers.get("x-signature-256"),
      rawBody
    }) ||
    verifyGitHubSignature(webhook, request.headers.get("x-hub-signature-256"), rawBody) ||
    verifySlackSignature(
      webhook,
      request.headers.get("x-slack-signature"),
      request.headers.get("x-slack-request-timestamp"),
      rawBody
    );
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

  // Slack Events API URL verification handshake.
  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const externalEventId =
    request.headers.get("x-github-delivery") ||
    request.headers.get("x-event-id") ||
    (typeof payload.event_id === "string" ? payload.event_id : null) ||
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

  const queued = await enqueueScenarioExecution({
    ownerId: webhook.ownerId,
    actorId: `webhook:${webhookId}`,
    scenario,
    executionMode: "live",
    triggerType: "webhook",
    triggerEventId: externalEventId || randomUUID(),
    triggerData: payload,
    priority: 30
  });

  if (!queued.queued) {
    return NextResponse.json({
      accepted: true,
      waitingConnection: true,
      executionId: queued.execution.id,
      findings: queued.findings
    }, { status: 202 });
  }

  return NextResponse.json({ accepted: true, executionId: queued.execution.id, jobId: queued.job.id }, { status: 202 });
}
