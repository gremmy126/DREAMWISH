import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getApprovalRequest } from "@/src/lib/automation/approval/approval.repository";
import { finalApproveAndQueue, rebuildCurrentApprovalSnapshotInput } from "@/src/lib/automation/approval/approval.service";
import { PostgresAutomationQueue } from "@/src/lib/automation/queue/postgres-queue";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";
import { verifyRecentFirebaseAuthentication } from "@/src/lib/firebase/firebase-server-auth";

type RouteContext = { params: Promise<{ requestId: string }> };
export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { requestId } = await context.params;
    const body = await request.json().catch(() => ({})) as { phrase?: string; criticalAuthToken?: string; criticalAuthCode?: string };
    const pending = await getApprovalRequest(owner.uid, requestId);
    if (!pending) return NextResponse.json({ ok: false, error: "Approval request not found." }, { status: 404 });
    if (pending.criticalAuthMethod === "otp") {
      await verifyConfiguredOtp({ ownerId: owner.uid, requestId, code: body.criticalAuthCode || "" });
    }
    if (pending.criticalAuthMethod === "admin" && owner.role !== "admin") {
      return NextResponse.json({ ok: false, error: "Administrator approval is required." }, { status: 403 });
    }
    if (pending.criticalAuthMethod === "password") {
      if (!body.criticalAuthToken) return NextResponse.json({ ok: false, error: "비밀번호 재확인이 필요합니다." }, { status: 401 });
      await verifyRecentFirebaseAuthentication(body.criticalAuthToken, owner.uid);
    }
    const result = await finalApproveAndQueue({
      ownerId: owner.uid,
      requestId,
      actorId: owner.uid,
      phrase: body.phrase,
      criticalAuthResult: pending.criticalAuthMethod ? "verified" : null,
      actualSnapshotInput: await rebuildCurrentApprovalSnapshotInput(owner.uid, requestId),
      queue: new PostgresAutomationQueue()
    });
    return NextResponse.json({ ok: true, approval: result.approval, jobId: result.job.id });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Final approval failed." }, { status });
  }
}

async function verifyConfiguredOtp(input: { ownerId: string; requestId: string; code: string }) {
  if (!/^\d{6,8}$/u.test(input.code)) throw new Error("6~8자리 OTP 코드를 입력해 주세요.");
  const endpoint = process.env.AUTOMATION_OTP_VERIFY_URL?.trim();
  if (!endpoint) throw Object.assign(new Error("OTP 인증 공급자가 구성되지 않았습니다."), { status: 501 });
  const url = new URL(endpoint);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("OTP 인증 공급자는 HTTPS를 사용해야 합니다.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": `approval-otp:${input.requestId}` },
    body: JSON.stringify(input)
  });
  const result = await response.json().catch(() => ({})) as { verified?: boolean };
  if (!response.ok || result.verified !== true) throw new Error("OTP 인증에 실패했습니다.");
}
