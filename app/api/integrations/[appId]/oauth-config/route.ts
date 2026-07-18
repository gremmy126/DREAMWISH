import { NextResponse } from "next/server";
import { z } from "zod";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { hasPostgresStorage } from "@/src/lib/db/postgres";
import {
  getOAuthAppConfigRecord,
  revokeOAuthAppConfig,
  saveOAuthAppConfig,
  toPublicOAuthAppConfig
} from "@/src/lib/repositories/oauth-app-config.repository";
import {
  listIntegrationConnections,
  updateConnectionStatus
} from "@/src/lib/repositories/integration-connection.repository";
import { assertConnectableOAuthProvider } from "@/src/lib/oauth/oauth-provider-registry";
import { getOAuthRedirectUri } from "@/src/lib/oauth/oauth-redirect";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ appId: string }> };

const bodySchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().min(1).max(4096)
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const app = requireOAuthCapableApp((await context.params).appId);
    const provider = assertConnectableOAuthProvider(app.oauthTarget!.provider);
    const record = await getOAuthAppConfigRecord(owner.uid, app.id);
    return NextResponse.json({
      ok: true,
      config: record ? toPublicOAuthAppConfig(record) : null,
      redirectUri: getOAuthRedirectUri(provider, request.url),
      officialSetupUrl: app.connectionGuide.officialSetupUrl,
      steps: app.connectionGuide.steps,
      scopeHelp: app.connectionGuide.scopeHelp
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const app = requireOAuthCapableApp((await context.params).appId);
    const provider = assertConnectableOAuthProvider(app.oauthTarget!.provider);
    const input = bodySchema.parse(await request.json());
    const saved = await saveOAuthAppConfig({
      ownerId: owner.uid,
      appId: app.id,
      provider,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      redirectUri: getOAuthRedirectUri(provider, request.url)
    });
    const publicConfig = toPublicOAuthAppConfig(saved);
    return NextResponse.json({ ok: true, config: publicConfig });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const app = requireOAuthCapableApp((await context.params).appId);
    const revoked = await revokeOAuthAppConfig(owner.uid, app.id);
    if (revoked && hasPostgresStorage()) {
      const connections = await listIntegrationConnections(owner.uid, app.id);
      for (const connection of connections) {
        if (!["disconnected", "revoked"].includes(connection.status)) {
          await updateConnectionStatus(
            owner.uid,
            connection.id,
            "reauthorization_required",
            owner.uid,
            "OAUTH_APP_CONFIG_REVOKED"
          );
        }
      }
    }
    return NextResponse.json({ ok: true, revoked });
  } catch (error) {
    return routeError(error);
  }
}

function requireOAuthCapableApp(appId: string) {
  const app = getAutomationApp(appId);
  if (!app?.oauthTarget) {
    throw Object.assign(new Error("OAuth를 지원하지 않는 앱입니다."), { status: 404 });
  }
  return app;
}

function routeError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error
    ? Number(error.status)
    : error instanceof z.ZodError
      ? 400
      : 400;
  const code = typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "OAUTH_APP_CONFIG_INVALID";
  return NextResponse.json(
    {
      ok: false,
      code,
      error: error instanceof Error ? safeErrorMessage(error) : "OAuth 앱 설정을 처리하지 못했습니다."
    },
    { status }
  );
}

function safeErrorMessage(error: Error) {
  if (error instanceof z.ZodError) return "Client ID와 Client Secret을 확인해 주세요.";
  return error.message.slice(0, 240);
}
