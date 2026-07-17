import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  await requireAdminContext(request);
  const { userId } = await context.params;
  const user = await getOperationalAccount(userId);
  if (!user) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  const entitlement = await getBillingEntitlement(user.id);
  return NextResponse.json({ ok: true, user, entitlement });
}
