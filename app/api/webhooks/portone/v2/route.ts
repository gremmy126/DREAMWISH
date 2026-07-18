import { NextResponse } from "next/server";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import { processBillingWebhook } from "@/src/lib/billing/billing-webhook.service";
import { normalizePortOneV2Webhook, verifyPortOneV2Webhook } from "@/src/lib/billing/portone/v2-webhook";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > 256_000) return NextResponse.json({ received: false }, { status: 413 });
    const config = getDomesticBillingConfig();
    requireBillingCapability(config, "webhookV2");
    const headers = Object.fromEntries(request.headers.entries());
    const webhook = await verifyPortOneV2Webhook({
      secret: config.values.v2WebhookSecret!, rawBody, headers
    });
    const normalized = normalizePortOneV2Webhook(
      webhook as unknown as Record<string, unknown>,
      config.mode,
      request.headers.get("webhook-id") || undefined
    );
    if (!normalized) return NextResponse.json({ received: true, ignored: true });
    const result = await processBillingWebhook(normalized);
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const invalidSignature = error instanceof Error && /Webhook|signature|header/i.test(`${error.name} ${error.message}`);
    return NextResponse.json({ received: false }, { status: invalidSignature ? 400 : 503 });
  }
}

