import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  parsePolarWebhookEvent,
  POLAR_CHECKOUT_SETTINGS
} from "@/src/lib/payments/polar.service";
import { recordPolarWebhookEvent } from "@/src/lib/repositories/payment.repository";

export async function GET() {
  return NextResponse.json({
    ok: true,
    provider: "polar",
    webhookUrl: POLAR_CHECKOUT_SETTINGS.webhookUrl
  });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.POLAR_WEBHOOK_SECRET || "";

  if (secret && !verifyStandardWebhookSignature(rawBody, request.headers, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 403 });
  }

  const payload = rawBody ? JSON.parse(rawBody) : {};
  const event = parsePolarWebhookEvent(payload);
  await recordPolarWebhookEvent(event);

  return NextResponse.json({ ok: true, eventType: event.type }, { status: 202 });
}

function verifyStandardWebhookSignature(body: string, headers: Headers, secret: string) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatureHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) return false;

  const signedPayload = `${id}.${timestamp}.${body}`;
  const expected = createHmac("sha256", decodeWebhookSecret(secret))
    .update(signedPayload)
    .digest("base64");

  return signatureHeader
    .split(" ")
    .flatMap((chunk) => chunk.split(","))
    .some((signature) => {
      const normalized = signature.replace(/^v\d+=?/, "");
      return safeEqual(normalized, expected);
    });
}

function decodeWebhookSecret(secret: string) {
  const cleaned = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  try {
    return Buffer.from(cleaned, "base64");
  } catch {
    return Buffer.from(cleaned, "utf8");
  }
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
