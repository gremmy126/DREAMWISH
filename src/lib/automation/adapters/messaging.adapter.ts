import { resolveStructuredActionCredential } from "../action-credential.service";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { compactObject, text } from "./adapter-utils";
import { isAdapterImplementationAvailable } from "./adapter-availability";
import { executeOAuthJson } from "./oauth-json-client";

const APPS = new Set(["discord", "telegram"]);

export const messagingActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return APPS.has(adapterKey.split(".")[0]!) && isAdapterImplementationAvailable(adapterKey, adapterVersion);
  },
  execute(input) {
    return input.definition.appId === "discord" ? executeDiscord(input) : executeTelegram(input);
  }
};

async function executeDiscord(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  const values = input.normalizedInput;
  const actionId = input.definition.id;
  const api = (path: string, method = "POST", body?: unknown) => executeOAuthJson(input, {
    url: `https://discord.com/api/v10${path}`,
    method,
    body
  });

  if (actionId === "send-channel-message") {
    return api(`/channels/${segment(text(values, "channelId"))}/messages`, "POST", {
      content: text(values, "message"),
      nonce: input.idempotencyKey,
      enforce_nonce: true
    });
  }
  if (actionId === "send-direct-message") {
    const opened = await api("/users/@me/channels", "POST", { recipient_id: text(values, "userId") });
    const channelId = String(opened.output.id || "");
    if (!channelId) throw permanent("Discord did not return a direct-message channel.");
    const sent = await api(`/channels/${segment(channelId)}/messages`, "POST", {
      content: text(values, "message"),
      nonce: input.idempotencyKey,
      enforce_nonce: true
    });
    return combine(opened, sent);
  }
  if (actionId === "add-role" || actionId === "remove-role") {
    return api(
      `/guilds/${segment(text(values, "serverId"))}/members/${segment(text(values, "userId"))}/roles/${segment(text(values, "roleId"))}`,
      actionId === "add-role" ? "PUT" : "DELETE"
    );
  }
  if (actionId === "create-channel") {
    return api(`/guilds/${segment(text(values, "serverId"))}/channels`, "POST", {
      name: text(values, "name"),
      type: text(values, "type", "text") === "voice" ? 2 : 0
    });
  }

  const channelId = segment(text(values, "channelId"));
  const messageId = text(values, "messageId").trim();
  return api(
    messageId
      ? `/channels/${channelId}/messages/${segment(messageId)}/threads`
      : `/channels/${channelId}/threads`,
    "POST",
    compactObject({
      name: text(values, "name"),
      auto_archive_duration: 1440,
      type: messageId ? undefined : 11
    })
  );
}

async function executeTelegram(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  if (!input.connectionId) throw permanent("A Telegram connection must be selected.", "CONNECTION_REQUIRED");
  const credential = await resolveStructuredActionCredential(input.ownerId, input.connectionId, "telegram");
  const token = credential.values.botToken || "";
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/u.test(token)) throw permanent("The Telegram bot token is invalid.", "CREDENTIAL_INVALID");
  const values = input.normalizedInput;
  const actionId = input.definition.id;
  const method = actionId === "send-message"
    ? "sendMessage"
    : actionId === "send-photo"
      ? "sendPhoto"
      : "sendDocument";
  const body = method === "sendMessage"
    ? compactObject({
        chat_id: text(values, "chatId"),
        text: text(values, "message"),
        parse_mode: text(values, "parseMode", "plain") === "plain" ? undefined : text(values, "parseMode")
      })
    : method === "sendPhoto"
      ? compactObject({ chat_id: text(values, "chatId"), photo: text(values, "photo"), caption: values.caption ? text(values, "caption") : undefined })
      : compactObject({
          chat_id: text(values, "chatId"),
          document: text(values, actionId === "send-document" ? "document" : "file"),
          caption: values.caption ? text(values, "caption") : undefined
        });
  const startedAt = performance.now();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000)
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) {
    const retryable = response.status === 429 || response.status >= 500;
    throw Object.assign(new Error(`Telegram API request failed (${response.status}).`), {
      code: response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "ACTION_FAILED",
      retryable,
      retryAfter: telegramRetryAfter(payload)
    });
  }
  const result = payload.result;
  return {
    output: result && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, unknown>
      : { result },
    apiRequestId: response.headers.get("x-request-id"),
    rateLimitRemaining: null,
    adapterLatencyMs: Math.round(performance.now() - startedAt)
  };
}

function segment(value: string) {
  if (!value.trim()) throw permanent("A required provider resource ID is missing.", "ACTION_INPUT_INVALID");
  return encodeURIComponent(value);
}

function combine(first: ActionAdapterExecutionResult, last: ActionAdapterExecutionResult): ActionAdapterExecutionResult {
  return {
    ...last,
    apiRequestId: last.apiRequestId || first.apiRequestId,
    rateLimitRemaining: last.rateLimitRemaining ?? first.rateLimitRemaining,
    adapterLatencyMs: (first.adapterLatencyMs || 0) + (last.adapterLatencyMs || 0)
  };
}

function telegramRetryAfter(payload: Record<string, unknown> | null) {
  const parameters = payload?.parameters;
  if (!parameters || typeof parameters !== "object") return null;
  const retryAfter = Number((parameters as Record<string, unknown>).retry_after);
  return Number.isFinite(retryAfter) ? String(retryAfter) : null;
}

function permanent(message: string, code = "ACTION_FAILED") {
  return Object.assign(new Error(message), { code, retryable: false });
}
