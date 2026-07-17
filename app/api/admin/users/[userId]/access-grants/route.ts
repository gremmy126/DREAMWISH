import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent, getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { grantAccess, listAccessGrants, revokeAccessGrant } from "@/src/lib/coupons/coupon.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  await requireAdminContext(request);
  const { userId } = await context.params;
  return NextResponse.json({ ok: true, grants: await listAccessGrants(userId) });
}

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  assertSameOriginMutation(request);
  const owner = await requireAdminContext(request);
  const { userId } = await context.params;
  const target = await getOperationalAccount(userId);
  if (!target) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { days?: number };
  const days = Math.trunc(Number(body.days || 0));
  if (days < 1 || days > 3650) return NextResponse.json({ ok: false, error: "이용권 기간은 1~3650일이어야 합니다." }, { status: 400 });
  const grant = await grantAccess({ userId, days });
  await appendAdminAuditEvent({ actorAccountId: owner.uid, targetAccountId: userId, action: "access_grant.create", safeMetadata: { grantId: grant.id, days, endsAt: grant.endsAt } });
  return NextResponse.json({ ok: true, grant }, { status: 201 });
}

export async function DELETE(request: Request, context: { params: Promise<{ userId: string }> }) {
  assertSameOriginMutation(request);
  const owner = await requireAdminContext(request);
  const { userId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { grantId?: string; confirmationPhrase?: string };
  if (!body.grantId || body.confirmationPhrase !== "REVOKE") return NextResponse.json({ ok: false, error: "REVOKE 확인 문구가 필요합니다." }, { status: 400 });
  const grant = await revokeAccessGrant(body.grantId, userId);
  await appendAdminAuditEvent({ actorAccountId: owner.uid, targetAccountId: userId, action: "access_grant.revoke", safeMetadata: { grantId: grant.id } });
  return NextResponse.json({ ok: true, grant });
}

