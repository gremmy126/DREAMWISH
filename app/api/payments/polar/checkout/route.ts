import { NextResponse } from "next/server";
import { createPolarCheckoutSession } from "@/src/lib/payments/polar.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      customerEmail?: string;
      customerName?: string;
      externalCustomerId?: string;
    };
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      undefined;
    const checkout = await createPolarCheckoutSession({
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      externalCustomerId: body.externalCustomerId,
      customerIpAddress: ip
    });

    return NextResponse.json({ ok: true, checkoutUrl: checkout.url, checkout });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Polar 결제를 시작하지 못했습니다."
      },
      { status: 400 }
    );
  }
}
