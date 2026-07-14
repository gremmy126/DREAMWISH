import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  listBusinessConversations,
  type MessageProvider
} from "@/src/lib/business/business-message.service";
import { getGmailSyncReadiness } from "@/src/lib/integrations/gmail-readiness";
import { runManualIntegrationSync } from "@/src/lib/integrations/sync-engine";
import { getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { provider?: string };
  const provider = parseProvider(body.provider);
  if (!provider) {
    return NextResponse.json(
      { code: "INVALID_PROVIDER", error: "Gmail 또는 Slack을 선택해주세요." },
      { status: 400 }
    );
  }

  const readiness = provider === "gmail"
    ? await getGmailSyncReadiness(owner.uid)
    : await getSlackReadiness(owner.uid);
  const { status, syncReady, syncBlockReason } = readiness;
  const cached = await listBusinessConversations(owner.uid, provider);
  if (!syncReady) {
    return NextResponse.json(
      {
        provider,
        status,
        syncReady,
        syncBlockReason,
        latestSync: null,
        conversations: cached,
        code: "reconnect_required",
        error: getReadinessError(provider, syncBlockReason)
      },
      { status: 409 }
    );
  }

  const sync = await runManualIntegrationSync(owner.uid, provider, {
    days: 30,
    limit: provider === "gmail" ? 50 : 20
  });
  const conversations = await listBusinessConversations(owner.uid, provider);
  const response = {
    provider,
    status,
    syncReady: true,
    syncBlockReason: null,
    latestSync: sync,
    sync,
    conversations
  };
  if (sync.status === "failed") {
    if (isAuthorizationFailure(sync.message)) {
      return NextResponse.json(
        {
          ...response,
          syncReady: false,
          syncBlockReason: "token_unavailable",
          code: "reconnect_required",
          error: `${provider === "gmail" ? "Gmail" : "Slack"} 인증이 만료되었습니다. 다시 연결해주세요.`
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        ...response,
        code: "SYNC_TEMPORARY_ERROR",
        error: `${provider === "gmail" ? "Gmail" : "Slack"} 서비스와 통신하지 못했습니다. 잠시 후 다시 시도해주세요.`
      },
      { status: 502 }
    );
  }
  if (sync.status === "blocked") {
    return NextResponse.json(
      { ...response, code: "reconnect_required", error: sync.message },
      { status: 409 }
    );
  }
  return NextResponse.json(response);
}

function parseProvider(value: unknown): MessageProvider | null {
  return value === "gmail" || value === "slack" ? value : null;
}

async function getSlackReadiness(ownerId: string) {
  const status = await getOAuthConnectionStatus(ownerId, "slack", "slack");
  const hasReadScope = status.scope.some((item) =>
    ["channels:history", "groups:history", "im:history", "mpim:history"].includes(item)
  );
  return {
    status,
    syncReady: status.connectionState === "connected" && hasReadScope,
    syncBlockReason:
      status.connectionState !== "connected"
        ? "reconnect_required"
        : hasReadScope
          ? null
          : "missing_read_scope"
  };
}

function getReadinessError(provider: MessageProvider, reason: string | null) {
  if (reason === "missing_read_scope") {
    return `${provider === "gmail" ? "Gmail 읽기" : "Slack 대화 기록"} 권한으로 다시 연결해주세요.`;
  }
  if (reason === "token_unavailable") {
    return `${provider === "gmail" ? "Gmail" : "Slack"} 인증을 갱신하지 못했습니다. 다시 연결해주세요.`;
  }
  return "계정을 다시 연결해주세요.";
}

function isAuthorizationFailure(message: string) {
  return /(?:^|\D)(?:401|403)(?:\D|$)/u.test(message);
}
