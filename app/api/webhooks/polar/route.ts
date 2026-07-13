import { Webhooks } from "@polar-sh/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { applyPolarBillingEvent } from "@/src/lib/billing/billing.repository";
import { extractPolarBillingEvent } from "@/src/lib/billing/polar-event";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { received: false, error: "Webhook is not configured." },
      { status: 503 }
    );
  }

  const handler = Webhooks({
    webhookSecret,
    onPayload: async (payload) => {
      const event = extractPolarBillingEvent(payload);
      if (!event) return;
      await applyPolarBillingEvent(event);
    }
  });
  return handler(request);
}
