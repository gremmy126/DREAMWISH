import { NextResponse } from "next/server";
import {
  assertAdminMutationAllowed,
  requireAdminContext
} from "@/src/lib/admin/admin-guard";
import {
  appendAdminAuditEvent,
  countActiveAdministrators,
  getOperationalAccount,
  mutateOperationalAccount,
  upsertOperationalAccount
} from "@/src/lib/admin/account-admin.repository";
import type { AdminAction } from "@/src/lib/admin/account-admin.types";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const CONFIRMATION_PHRASES: Partial<Record<AdminAction, string>> = {
  suspend: "SUSPEND",
  force_logout: "REVOKE",
  promote: "ADMIN",
  demote: "REVOKE",
  schedule_delete: "DELETE",
  delete: "DELETE"
};

const ACTIONS = new Set<AdminAction>([
  "suspend", "restore", "force_logout", "promote", "demote",
  "schedule_delete", "cancel_delete", "delete"
]);

export async function POST(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireAdminContext(request);
    const { userId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      confirmationPhrase?: string;
    };
    if (!ACTIONS.has(body.action as AdminAction)) {
      return NextResponse.json({ ok: false, error: "Unsupported administrator action." }, { status: 400 });
    }
    const action = body.action as AdminAction;
    const expected = CONFIRMATION_PHRASES[action];
    if (expected && body.confirmationPhrase !== expected) {
      return NextResponse.json(
        { ok: false, error: `확인 문구 ${expected}를 정확히 입력해 주세요.` },
        { status: 400 }
      );
    }
    const actor =
      (await getOperationalAccount(owner.uid)) ||
      (await upsertOperationalAccount({
        id: owner.uid,
        email: owner.email,
        provider: "password",
        providerSubject: owner.uid
      }));
    const target = await getOperationalAccount(userId);
    if (!target) return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
    const adminCount = await countActiveAdministrators();
    assertAdminMutationAllowed(actor, target, action, adminCount);
    const updated = await mutateOperationalAccount(userId, { type: action });
    await appendAdminAuditEvent({
      actorAccountId: actor.id,
      targetAccountId: target.id,
      action: `user.${action}`,
      safeMetadata: {
        priorRole: target.role,
        nextRole: updated.role,
        priorStatus: target.status,
        nextStatus: updated.status
      }
    });
    return NextResponse.json({ ok: true, user: updated });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number((error as { status?: number }).status) || 500
      : 500;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Administrator action failed." },
      { status }
    );
  }
}
