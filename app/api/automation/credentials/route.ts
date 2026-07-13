import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  isCredentialPersistenceError,
  listCredentials,
  saveVerifiedCredential
} from "@/src/lib/automation/credential.repository";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import { isIntegrationCredentialError, verifyIntegrationCredential } from "@/src/lib/integrations/credential-verifier";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ credentials: await listCredentials(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    appId?: string;
    label?: string;
    secret?: string;
    values?: Record<string, unknown>;
  };
  if (!body.appId) return NextResponse.json({ error: "연결할 앱을 선택하세요." }, { status: 400 });

  const app = getAutomationApp(body.appId);
  if (body.values && typeof body.values === "object") {
    if (!app) return NextResponse.json({ error: "지원하지 않는 자동화 앱입니다." }, { status: 400 });
    if (!app.verificationKind || app.credentialFields.length === 0) {
      return NextResponse.json({ code: "OAUTH_REQUIRED", error: "이 앱은 연동 페이지에서 OAuth 계정 연결을 완료하세요." }, { status: 400 });
    }
    const allowedIds = new Set(app.credentialFields.map((field) => field.id));
    const values = Object.fromEntries(
      Object.entries(body.values)
        .filter(([key, value]) => allowedIds.has(key) && typeof value === "string")
        .map(([key, value]) => [key, (value as string).trim()])
    );
    const missing = app.credentialFields.filter((field) => field.required && !values[field.id]);
    if (missing.length > 0) {
      return NextResponse.json({ error: `${missing.map((field) => field.label).join(", ")} 값을 입력하세요.` }, { status: 400 });
    }
    try {
      const verification = await verifyIntegrationCredential(app.id, values);
      const credential = await saveVerifiedCredential({
        ownerId: owner.uid,
        appId: app.id,
        label: body.label || verification.accountLabel || app.label,
        values,
        accountLabel: verification.accountLabel,
        providerAccountId: verification.providerAccountId,
      });
      return NextResponse.json({ credential }, { status: 201 });
    } catch (error) {
      if (isIntegrationCredentialError(error)) {
        return NextResponse.json({ code: error.code, error: error.message.replace(/^\w+:\s*/u, "") }, { status: error.status });
      }
      if (isCredentialPersistenceError(error)) {
        return NextResponse.json(
          { code: error.code, error: error.message },
          { status: error.status }
        );
      }
      return NextResponse.json({ code: "CREDENTIAL_SAVE_FAILED", error: "검증된 연결 정보를 안전하게 저장하지 못했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({
    code: app?.supportedAuthModes.includes("oauth") ? "OAUTH_REQUIRED" : "APP_FIELDS_REQUIRED",
    error: app?.supportedAuthModes.includes("oauth")
      ? "이 앱은 연동 페이지에서 OAuth 계정 연결을 완료하세요."
      : "앱에 필요한 연결 항목을 모두 입력하세요.",
  }, { status: 400 });
}
