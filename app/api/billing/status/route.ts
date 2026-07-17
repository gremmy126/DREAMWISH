import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { buildOperationalAccessState, hasEffectiveEntitlement } from "@/src/lib/billing/effective-entitlement";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const entitlement = await getBillingEntitlement(owner.uid);
  const account = await getOperationalAccount(owner.uid);
  const entitled = await hasEffectiveEntitlement({ userId: owner.uid, role: owner.role, billingActive: entitlement.status === "active" });
  const access = buildOperationalAccessState({ email: owner.email, role: owner.role, entitled });
  const response = NextResponse.json({ ok: true, access, entitlement });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionToken({
      uid: owner.uid,
      email: owner.email,
      name: null,
      role: owner.role,
      paid: access.paid,
      entitled: access.canUseApp,
      sessionVersion: account?.sessionVersion || 1
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}
