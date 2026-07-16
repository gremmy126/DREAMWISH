import { assertPublicDns, assertSafeUrlFormat } from "../deep-research/safe-fetch";
import { getActiveAccessToken, getOAuthConnectionStatus } from "../oauth/token.service";
import { buildGmailRawMessage } from "./business-message.service";

export type OutboundSendResult =
  | { ok: true; messageId: string; threadId?: string | null }
  | { ok: false; error: string; code?: "reconnect_required" | "invalid_recipient" | "send_failed" };

/**
 * Sends a Gmail message with the owner's OAuth token. Never logs tokens or
 * message bodies; callers surface only the safe result.
 */
export async function sendGmailMessage(
  ownerId: string,
  input: { to: string; subject: string; body: string; threadId?: string | null },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  const status = await getOAuthConnectionStatus(ownerId, "google", "gmail");
  const canSend = status.scope.some(
    (scope) =>
      scope.includes("gmail.compose") || scope.includes("gmail.send") || scope.includes("gmail.modify")
  );
  const token = canSend ? await getActiveAccessToken(ownerId, "google", "gmail") : null;
  if (!token) {
    return { ok: false, error: "Gmail 작성 권한으로 다시 연결해주세요.", code: "reconnect_required" };
  }
  let raw: string;
  try {
    raw = buildGmailRawMessage({ to: input.to, subject: input.subject, body: input.body });
  } catch {
    return { ok: false, error: "받는 사람 이메일을 확인해주세요.", code: "invalid_recipient" };
  }
  const response = await fetchFn("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, ...(input.threadId ? { threadId: input.threadId } : {}) })
  });
  const result = (await response.json().catch(() => null)) as
    | { id?: string; threadId?: string; error?: { message?: string } }
    | null;
  if (!response.ok || !result?.id) {
    return { ok: false, error: result?.error?.message || "Gmail 전송에 실패했습니다.", code: "send_failed" };
  }
  return { ok: true, messageId: result.id, threadId: result.threadId || input.threadId || null };
}

/** Posts a Slack message with the owner's OAuth token. */
export async function sendSlackMessage(
  ownerId: string,
  input: { channel: string; text: string; threadTs?: string | null },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  const status = await getOAuthConnectionStatus(ownerId, "slack", "slack");
  const canSend = status.scope.includes("chat:write");
  const token = canSend ? await getActiveAccessToken(ownerId, "slack", "slack") : null;
  if (!token) {
    return { ok: false, error: "Slack chat:write 권한으로 다시 연결해주세요.", code: "reconnect_required" };
  }
  const response = await fetchFn("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      channel: input.channel,
      text: input.text,
      ...(input.threadTs ? { thread_ts: input.threadTs } : {})
    })
  });
  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; ts?: string; channel?: string; error?: string }
    | null;
  if (!response.ok || result?.ok !== true) {
    return { ok: false, error: result?.error || "Slack 전송에 실패했습니다.", code: "send_failed" };
  }
  return { ok: true, messageId: result.ts || "" };
}

/** Creates a GitHub issue with the owner's OAuth token. `repo` is "owner/repo". */
export async function createGitHubIssue(
  ownerId: string,
  input: { repo: string; title: string; body: string },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  const token = await getActiveAccessToken(ownerId, "github");
  if (!token) {
    return { ok: false, error: "GitHub 계정을 다시 연결해주세요.", code: "reconnect_required" };
  }
  if (!/^[\w.-]+\/[\w.-]+$/u.test(input.repo)) {
    return { ok: false, error: "저장소는 owner/repo 형식이어야 합니다.", code: "invalid_recipient" };
  }
  const response = await fetchFn(`https://api.github.com/repos/${input.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: input.title, body: input.body })
  });
  const result = (await response.json().catch(() => null)) as
    | { number?: number; html_url?: string; message?: string }
    | null;
  if (!response.ok || !result?.number) {
    return { ok: false, error: result?.message || "GitHub 이슈 생성에 실패했습니다.", code: "send_failed" };
  }
  return { ok: true, messageId: String(result.number) };
}

/** Creates a Notion page under a parent page with the owner's OAuth token. */
export async function createNotionPage(
  ownerId: string,
  input: { parentPageId: string; title: string; content: string },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  const token = await getActiveAccessToken(ownerId, "notion");
  if (!token) {
    return { ok: false, error: "Notion 계정을 다시 연결해주세요.", code: "reconnect_required" };
  }
  const response = await fetchFn("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      parent: { page_id: input.parentPageId },
      properties: {
        title: { title: [{ text: { content: input.title.slice(0, 200) } }] }
      },
      children: input.content
        ? [
            {
              object: "block",
              type: "paragraph",
              paragraph: { rich_text: [{ text: { content: input.content.slice(0, 1900) } }] }
            }
          ]
        : []
    })
  });
  const result = (await response.json().catch(() => null)) as
    | { id?: string; message?: string }
    | null;
  if (!response.ok || !result?.id) {
    return { ok: false, error: result?.message || "Notion 페이지 생성에 실패했습니다.", code: "send_failed" };
  }
  return { ok: true, messageId: result.id };
}

/**
 * Calls a user-configured webhook with an SSRF guard: HTTPS only, no
 * credentials in the URL, and no private/internal destinations.
 */
export async function callOutboundWebhook(
  input: { url: string; payload: string },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  try {
    const url = assertSafeUrlFormat(input.url);
    await assertPublicDns(url.hostname);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "웹훅 URL이 안전하지 않습니다.",
      code: "invalid_recipient"
    };
  }
  let body = input.payload;
  try {
    JSON.parse(input.payload);
  } catch {
    body = JSON.stringify({ message: input.payload });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchFn(input.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal
    });
    if (!response.ok) {
      return { ok: false, error: `웹훅 응답 오류 (HTTP ${response.status})`, code: "send_failed" };
    }
    return { ok: true, messageId: String(response.status) };
  } catch {
    return { ok: false, error: "웹훅 호출에 실패했습니다.", code: "send_failed" };
  } finally {
    clearTimeout(timeout);
  }
}

/** Posts to a Discord incoming-webhook URL (discord.com only). */
export async function sendDiscordWebhook(
  input: { webhookUrl: string; content: string },
  fetchFn: typeof fetch = fetch
): Promise<OutboundSendResult> {
  let host = "";
  try {
    host = new URL(input.webhookUrl).hostname.toLowerCase();
  } catch {
    return { ok: false, error: "Discord 웹훅 URL을 확인해주세요.", code: "invalid_recipient" };
  }
  if (host !== "discord.com" && host !== "discordapp.com") {
    return { ok: false, error: "discord.com 웹훅 URL만 허용됩니다.", code: "invalid_recipient" };
  }
  return callOutboundWebhook(
    { url: input.webhookUrl, payload: JSON.stringify({ content: input.content.slice(0, 1900) }) },
    fetchFn
  );
}
