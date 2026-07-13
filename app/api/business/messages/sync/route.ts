import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  listBusinessConversations,
  type MessageProvider
} from "@/src/lib/business/business-message.service";
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

  const status = provider === "gmail"
    ? await getOAuthConnectionStatus(owner.uid, "google", "gmail")
    : await getOAuthConnectionStatus(owner.uid, "slack", "slack");
  const cached = await listBusinessConversations(owner.uid, provider);
  if (status.connectionState !== "connected") {
    return NextResponse.json(
      { provider, status, conversations: cached, code: "reconnect_required", error: "계정을 다시 연결해주세요." },
      { status: 409 }
    );
  }
  if (!hasReadScope(provider, status.scope)) {
    return NextResponse.json(
      { provider, status, conversations: cached, code: "reconnect_required", error: `${provider === "gmail" ? "Gmail 읽기" : "Slack 대화 기록"} 권한으로 다시 연결해주세요.` },
      { status: 409 }
    );
  }

  const sync = await runManualIntegrationSync(owner.uid, provider, {
    days: 30,
    limit: 50
  });
  const conversations = await listBusinessConversations(owner.uid, provider);
  const response = { provider, status, sync, conversations };
  if (sync.status === "failed") {
    return NextResponse.json(
      { ...response, code: "SYNC_FAILED", error: sync.message || "동기화에 실패했습니다." },
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

function hasReadScope(provider: MessageProvider, scope: string[]) {
  if (provider === "gmail") {
    return scope.some((item) =>
      item.includes("gmail.readonly") ||
      item.includes("gmail.modify") ||
      item.includes("mail.google.com")
    );
  }
  return scope.some((item) =>
    ["channels:history", "groups:history", "im:history", "mpim:history"].includes(item)
  );
}
