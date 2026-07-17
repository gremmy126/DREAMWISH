import { NextResponse } from "next/server";
import { buildAccessState } from "@/src/lib/auth/access-control";
import { getOwnerContext } from "@/src/lib/auth/owner-context";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";

export async function GET(request: Request) {
  const owner = await getOwnerContext(request);
  if (!owner) {
    return NextResponse.json({ ok: false, error: "Authentication is required." }, { status: 401 });
  }
  const account = await getOperationalAccount(owner.uid);
  const entitlement = owner.role === "admin" ? null : await getBillingEntitlement(owner.uid);
  const access = buildAccessState({
    email: owner.email,
    paid: owner.role === "admin" || entitlement?.status === "active"
  });
  return NextResponse.json({
    ok: true,
    access: { ...access, role: owner.role, adminBypass: owner.role === "admin" },
    account: {
      id: owner.uid,
      email: owner.email,
      name: account?.name || null,
      role: owner.role,
      status: account?.status || "active"
    }
  });
}
