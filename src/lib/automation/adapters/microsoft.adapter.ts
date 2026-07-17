import type { ActionAdapter, ActionAdapterExecutionInput } from "./action-adapter.types";
import { arrayValue, compactObject, text } from "./adapter-utils";
import { executeOAuthJson } from "./oauth-json-client";
import { isAdapterImplementationAvailable } from "./adapter-availability";

const APPS = new Set(["outlook", "microsoft-teams", "onedrive"]);

export const microsoftActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return APPS.has(adapterKey.split(".")[0]!) && isAdapterImplementationAvailable(adapterKey, adapterVersion);
  },
  execute(input) {
    if (input.definition.appId === "outlook") return executeOutlook(input);
    if (input.definition.appId === "microsoft-teams") return executeTeams(input);
    return executeOneDrive(input);
  }
};

function executeOutlook(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const graph = (path: string, method: string, body: unknown) => executeOAuthJson(input, {
    url: `https://graph.microsoft.com/v1.0${path}`, method, body,
    headers: { "client-request-id": input.idempotencyKey, "return-client-request-id": "true" }
  });
  if (input.definition.id === "send-email") return graph("/me/sendMail", "POST", {
    message: {
      subject: text(values, "subject"),
      body: { contentType: "Text", content: text(values, "body") },
      toRecipients: recipients([text(values, "to")]),
      ccRecipients: recipients(values.cc ? [text(values, "cc")] : [])
    },
    saveToSentItems: true
  });
  if (input.definition.id === "reply-email") return graph(`/me/messages/${encodeURIComponent(text(values, "messageId"))}/reply`, "POST", { comment: text(values, "body") });
  return graph(`/me/calendars/${encodeURIComponent(text(values, "calendarId"))}/events`, "POST", {
    subject: text(values, "title"),
    start: microsoftDate(text(values, "start")),
    end: microsoftDate(text(values, "end")),
    attendees: arrayValue(values, "guests").map((email) => ({ emailAddress: { address: String(email) }, type: "required" }))
  });
}

function executeTeams(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const id = input.definition.id;
  const path = id === "send-channel-message"
    ? `/teams/${encodeURIComponent(text(values, "teamId"))}/channels/${encodeURIComponent(text(values, "channelId"))}/messages`
    : id === "send-chat-message"
      ? `/chats/${encodeURIComponent(text(values, "chatId"))}/messages`
      : "/me/onlineMeetings";
  const body = id === "create-meeting"
    ? { subject: text(values, "subject"), startDateTime: text(values, "start"), endDateTime: text(values, "end"), participants: { attendees: arrayValue(values, "attendees").map((email) => ({ upn: String(email), role: "attendee" })) } }
    : { body: { contentType: "text", content: text(values, "message") } };
  return executeOAuthJson(input, {
    url: `https://graph.microsoft.com/v1.0${path}`, method: "POST", body,
    headers: { "client-request-id": input.idempotencyKey, "return-client-request-id": "true" }
  });
}

function executeOneDrive(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const item = `/me/drive/items/${encodeURIComponent(text(values, "fileId"))}`;
  if (input.definition.id === "move-file") return executeOAuthJson(input, {
    url: `https://graph.microsoft.com/v1.0${item}`, method: "PATCH",
    body: { parentReference: { id: text(values, "destination") } },
    headers: { "client-request-id": input.idempotencyKey, "return-client-request-id": "true" }
  });
  return executeOAuthJson(input, {
    url: `https://graph.microsoft.com/v1.0${item}/invite`, method: "POST",
    body: compactObject({ recipients: recipients([text(values, "recipient")]), roles: [text(values, "role", "view") === "edit" ? "write" : "read"], requireSignIn: true, sendInvitation: true }),
    headers: { "client-request-id": input.idempotencyKey, "return-client-request-id": "true" }
  });
}

function recipients(values: string[]) { return values.filter(Boolean).map((address) => ({ emailAddress: { address } })); }
function microsoftDate(value: string) { return { dateTime: value, timeZone: "UTC" }; }
