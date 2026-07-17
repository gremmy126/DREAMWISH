import { NextResponse } from "next/server";
import { getOwnerContext } from "@/src/lib/auth/owner-context";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";
import { buildOperationalAccessState, hasEffectiveEntitlement } from "@/src/lib/billing/effective-entitlement";

export async function GET(request: Request) {
  const owner = await getOwnerContext(request);
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Authentication is required." }, { status: 401 });
  }
  const account = await getOperationalAccount(owner.uid);
  const entitlement = owner.role === "admin" ? null : await getBillingEntitlement(owner.uid);
  const entitled = await hasEffectiveEntitlement({ userId: owner.uid, role: owner.role, billingActive: entitlement?.status === "active" });
  const access = buildOperationalAccessState({ email: owner.email, role: owner.role, entitled });
  return NextResponse.json({
    ok: true,
    access,
    account: {
      id: owner.uid,
      email: owner.email,
      name: account?.name || null,
      role: owner.role,
      status: account?.status || "active"
    }
  });
}
