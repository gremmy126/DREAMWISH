import { NextResponse } from "next/server";
import {
  createPolarCheckoutSession,
  PolarCheckoutError
} from "@/src/lib/payments/polar.service";

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
    const checkoutError = normalizeCheckoutError(error);
    return NextResponse.json(
      {
        ok: false,
        error: checkoutError.message,
        code: checkoutError.code
      },
      { status: checkoutError.status }
    );
  }
}

function normalizeCheckoutError(error: unknown) {
  if (error instanceof PolarCheckoutError) {
    return {
      status: error.status,
      code: error.code,
      message: error.clientMessage
    };
  }

  console.error("[Polar Checkout Route Error]", error);
  return {
    status: 500,
    code: "POLAR_CHECKOUT_FAILED",
    message: "결제창을 만들지 못했습니다."
  };
}
