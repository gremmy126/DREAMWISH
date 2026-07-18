import { NextResponse } from "next/server";
import { z } from "zod";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { processBillingWebhook } from "@/src/lib/billing/billing-webhook.service";

const webhookSchema = z.object({
  imp_uid: z.string().min(3).max(200),
  merchant_uid: z.string().min(3).max(200),
  status: z.string().min(2).max(50)
}).passthrough();

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 256_000) return NextResponse.json({ received: false }, { status: 413 });
    const body = webhookSchema.parse(await request.json());
    const config = getDomesticBillingConfig();
    const result = await processBillingWebhook({
      provider: "portone_kcp_v1",
      environment: config.mode,
      eventKey: `${body.imp_uid}:${body.merchant_uid}:${body.status}`,
      providerPaymentId: body.imp_uid,
      occurredAt: new Date().toISOString(),
      safePayload: { status: body.status, merchantUid: body.merchant_uid }
    });
    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json({ received: false }, { status: 503 });
  }
}

