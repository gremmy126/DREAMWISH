import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getAppOrigin, getPolarClient } from "@/src/lib/billing/polar";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const session = await getPolarClient().customerSessions.create({
      externalCustomerId: owner.uid,
      returnUrl: `${getAppOrigin()}/?view=settings&billing=return`
    });
    return NextResponse.json({ ok: true, portalUrl: session.customerPortalUrl });
  } catch (error) {
    console.error(
      "[billing.portal]",
      error instanceof Error ? error.name : "UNKNOWN"
    );
    return NextResponse.json(
      { ok: false, error: "구독 관리 페이지를 열지 못했습니다." },
      { status: 502 }
    );
  }
}
