import type { ActionAdapter } from "./action-adapter.types";
import type { ActionAdapterExecutionInput } from "./action-adapter.types";
import { executeOAuthJson } from "./oauth-json-client";
import { extractGmailBody, type GmailMessagePart } from "../gmail-trigger";
import { booleanValue, text } from "./adapter-utils";

export const triggerActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterVersion === 1 && (
      adapterKey === "gmail.watch-new-email" ||
      adapterKey === "webhook.receive" ||
      adapterKey.startsWith("schedule.")
    );
  },
  async execute(input) {
    if (input.definition.adapterKey === "gmail.watch-new-email") {
      return executeLatestGmailMessage(input);
    }
    return {
      output: {
        registered: true,
        triggerType: input.definition.adapterKey,
        configuration: input.normalizedInput
      },
      adapterLatencyMs: 0
    };
  }
};

async function executeLatestGmailMessage(input: ActionAdapterExecutionInput) {
  const query: string[] = ["-in:chats"];
  const values = input.normalizedInput;
  if (values.from) query.push(`from:${text(values, "from").replace(/[\r\n]/gu, "")}`);
  if (values.to) query.push(`to:${text(values, "to").replace(/[\r\n]/gu, "")}`);
  if (values.subject) query.push(`subject:"${text(values, "subject").replace(/["\r\n]/gu, "")}"`);
  if (booleanValue(values, "hasAttachment")) query.push("has:attachment");
  if (values.after) query.push(`after:${dateForGmail(text(values, "after"))}`);
  if (values.before) query.push(`before:${dateForGmail(text(values, "before"))}`);
  const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  listUrl.searchParams.set("q", query.join(" "));
  listUrl.searchParams.set("maxResults", "1");
  const listed = await executeOAuthJson(input, { url: listUrl.toString() });
  const messages = Array.isArray(listed.output.messages) ? listed.output.messages : [];
  const messageId = String((messages[0] as Record<string, unknown> | undefined)?.id || "");
  if (!messageId) {
    throw Object.assign(new Error("조건에 맞는 Gmail 이메일이 없어 테스트 실행을 시작하지 않았습니다."), {
      code: "NO_TRIGGER_EVENT",
      retryable: false
    });
  }
  const detail = await executeOAuthJson(input, {
    url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`
  });
  const payload = detail.output.payload as GmailMessagePart | undefined;
  const headers = new Map((payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value]));
  const internalDate = Number(detail.output.internalDate || 0);
  return {
    output: {
      email: {
        id: String(detail.output.id || messageId),
        threadId: String(detail.output.threadId || ""),
        from: headers.get("from") || "",
        to: headers.get("to") || "",
        subject: headers.get("subject") || "",
        snippet: String(detail.output.snippet || ""),
        body: extractGmailBody(payload) || String(detail.output.snippet || ""),
        receivedAt: internalDate ? new Date(internalDate).toISOString() : null
      }
    },
    apiRequestId: detail.apiRequestId || listed.apiRequestId,
    rateLimitRemaining: detail.rateLimitRemaining ?? listed.rateLimitRemaining,
    adapterLatencyMs: (listed.adapterLatencyMs || 0) + (detail.adapterLatencyMs || 0)
  };
}

function dateForGmail(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`
    : value.slice(0, 10).replace(/-/gu, "/");
}
