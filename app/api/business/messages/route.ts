import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildGmailRawMessage, listBusinessConversations, type MessageProvider } from "@/src/lib/business/business-message.service";
import { getActiveAccessToken, getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const provider = parseProvider(url.searchParams.get("provider"));
  if (!provider) return NextResponse.json({ error: "Gmail 또는 Slack을 선택해주세요." }, { status: 400 });
  const status = provider === "gmail"
    ? await getOAuthConnectionStatus(owner.uid, "google", "gmail")
    : await getOAuthConnectionStatus(owner.uid, "slack", "slack");
  return NextResponse.json(
    { provider, status, conversations: await listBusinessConversations(owner.uid, provider) },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { provider?: string; target?: string; subject?: string; message?: string; threadId?: string };
  const provider = parseProvider(body.provider || null);
  const message = String(body.message || "").trim();
  if (!provider || !message || message.length > 100_000) return NextResponse.json({ error: "전송할 메시지를 확인해주세요." }, { status: 400 });

  if (provider === "gmail") {
    const status = await getOAuthConnectionStatus(owner.uid, "google", "gmail");
    const canSend = status.scope.some((scope) => scope.includes("gmail.compose") || scope.includes("gmail.send") || scope.includes("gmail.modify"));
    const token = canSend ? await getActiveAccessToken(owner.uid, "google", "gmail") : null;
    if (!token) return NextResponse.json({ error: "Gmail 작성 권한으로 다시 연결해주세요.", code: "reconnect_required" }, { status: 409 });
    let raw: string;
    try { raw = buildGmailRawMessage({ to: String(body.target || ""), subject: String(body.subject || ""), body: message }); }
    catch { return NextResponse.json({ error: "받는 사람 이메일을 확인해주세요." }, { status: 400 }); }
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw, ...(body.threadId ? { threadId: body.threadId } : {}) })
    });
    const result = (await response.json().catch(() => null)) as { id?: string; threadId?: string; error?: { message?: string } } | null;
    if (!response.ok || !result?.id) return NextResponse.json({ error: result?.error?.message || "Gmail 전송에 실패했습니다." }, { status: 502 });
    return NextResponse.json({ ok: true, provider, messageId: result.id, threadId: result.threadId || body.threadId || null });
  }

  const status = await getOAuthConnectionStatus(owner.uid, "slack", "slack");
  const canSend = status.scope.includes("chat:write");
  const token = canSend ? await getActiveAccessToken(owner.uid, "slack", "slack") : null;
  if (!token) return NextResponse.json({ error: "Slack chat:write 권한으로 다시 연결해주세요.", code: "reconnect_required" }, { status: 409 });
  const response = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel: String(body.target || ""), text: message, ...(body.threadId ? { thread_ts: body.threadId } : {}) })
  });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; ts?: string; channel?: string; error?: string } | null;
  if (!response.ok || result?.ok !== true) return NextResponse.json({ error: result?.error || "Slack 전송에 실패했습니다." }, { status: 502 });
  return NextResponse.json({ ok: true, provider, messageId: result.ts, channelId: result.channel || body.target });
}

function parseProvider(value: string | null): MessageProvider | null { return value === "gmail" || value === "slack" ? value : null; }
