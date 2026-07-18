import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { verifyDomesticPayment } from "@/src/lib/billing/domestic-payment.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const inputSchema = z.object({
  attemptId: z.string().uuid(),
  providerPaymentId: z.string().regex(/^[A-Za-z0-9]+$/u).max(80)
}).strict();

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const body = inputSchema.parse(await request.json());
    const attempt = await verifyDomesticPayment({ ownerId: owner.uid, ...body });
    return NextResponse.json({ ok: true, attemptId: attempt.id, status: attempt.status, environment: attempt.environment });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "결제 검증에 실패했습니다." }, { status });
  }
}

