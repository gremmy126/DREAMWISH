import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listCredentials, saveCredential, saveCredentialValues } from "@/src/lib/automation/credential.repository";
import { getAutomationApp } from "@/src/lib/automation/app-registry";

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
  if (body.values) {
    if (!app) return NextResponse.json({ error: "지원하지 않는 자동화 앱입니다." }, { status: 400 });
    if (app.authType === "oauth") {
      return NextResponse.json({ error: "OAuth 앱은 연동 페이지에서 계정 연결을 완료하세요." }, { status: 400 });
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
    const credential = await saveCredentialValues({ ownerId: owner.uid, appId: app.id, label: body.label || app.label, values });
    return NextResponse.json({ credential }, { status: 201 });
  }

  if (!body.secret) return NextResponse.json({ error: "API 키 또는 토큰을 입력하세요." }, { status: 400 });
  const credential = await saveCredential({ ownerId: owner.uid, appId: body.appId, label: body.label || "", secret: body.secret });
  return NextResponse.json({ credential }, { status: 201 });
}
