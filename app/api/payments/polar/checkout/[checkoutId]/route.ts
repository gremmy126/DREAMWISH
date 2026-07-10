import { NextResponse } from "next/server";
import {
  PolarCheckoutError,
  verifyPolarCheckoutSession
} from "@/src/lib/payments/polar.service";
import { markAccountPaid } from "@/src/lib/auth/account.repository";

type RouteContext = {
  params: Promise<{
    checkoutId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { checkoutId } = await context.params;
    const checkout = await verifyPolarCheckoutSession(checkoutId);

    if (checkout.paid && checkout.customerEmail) {
      await markAccountPaid({
        email: checkout.customerEmail,
        externalCustomerId: checkout.customerEmail
      });
    }

    return NextResponse.json({
      ok: true,
      checkout: {
        id: checkout.id,
        paid: checkout.paid,
        status: checkout.status,
        customerEmail: checkout.customerEmail
      }
    });
  } catch (error) {
    const normalized = normalizeCheckoutError(error);
    return NextResponse.json(
      {
        ok: false,
        error: normalized.message,
        code: normalized.code
      },
      { status: normalized.status }
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

  console.error("[Polar Checkout Verify Route Error]", error);
  return {
    status: 500,
    code: "POLAR_CHECKOUT_VERIFY_FAILED",
    message: "Payment status could not be verified."
  };
}
