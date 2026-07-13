import { NextResponse } from "next/server";
import { buildAccessState } from "@/src/lib/auth/access-control";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const entitlement = await getBillingEntitlement(owner.uid);
  const access = buildAccessState({
    email: owner.email,
    paid: entitlement.status === "active"
  });
  const response = NextResponse.json({ ok: true, access, entitlement });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: await createSessionToken({
      uid: owner.uid,
      email: owner.email,
      name: null,
      paid: access.paid
    }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  });
  return response;
}
