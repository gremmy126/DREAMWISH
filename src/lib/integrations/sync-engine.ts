import { matchExternalIdentity } from "./identity-matcher";
import { connectorRegistry } from "./registry";
import { buildGmailMessageListUrl } from "./gmail-message-list-url";
import { groupGmailThreads } from "./gmail-thread-grouping";
import type { ConnectorSyncResult, ManualSyncOptions, SyncOptions } from "./types";
import { getActiveAccessToken } from "@/src/lib/oauth/token.service";
import { upsertCalendarEvents } from "@/src/lib/repositories/calendar-event.repository";
import { addExternalIdentityMatch } from "@/src/lib/repositories/external-identity-match.repository";
import { upsertGmailAttachments } from "@/src/lib/repositories/gmail-attachment.repository";
import { upsertGmailMessages } from "@/src/lib/repositories/gmail-message.repository";
import { upsertGmailThreads } from "@/src/lib/repositories/gmail-thread.repository";
import { upsertSlackChannels } from "@/src/lib/repositories/slack-channel.repository";
import { upsertSlackMessages } from "@/src/lib/repositories/slack-message.repository";
import { addSyncHistory } from "@/src/lib/repositories/sync-history.repository";
import {
  normalizeExternalEvent,
  normalizeExternalMessage
} from "@/src/lib/sync/normalizer";

export async function runMockSync(
  ownerId: string,
  connectorId: string,
  options: SyncOptions = { type: "mock", limit: 3 }
): Promise<ConnectorSyncResult> {
  const connector = connectorRegistry.get(connectorId);
  const result = await connector.sync({ ...options, type: "mock" });
  await addSyncHistory(ownerId, result);
  return result;
}

export async function runManualIntegrationSync(
  ownerId: string,
  connectorId: string,
  options: ManualSyncOptions = { days: 30, limit: 20 }
) {
  const connector = connectorRegistry.get(connectorId);
  if (!["gmail", "calendar", "slack"].includes(connectorId)) {
    const result = await connector.sync({ type: "mock", limit: options.limit });
    await addSyncHistory(ownerId, result);
    return result;
  }

  const accessToken = connectorId === "gmail"
    ? await getActiveAccessToken(ownerId, "google", "gmail")
    : connectorId === "calendar"
      ? await getActiveAccessToken(ownerId, "google", "calendar")
      : await getActiveAccessToken(ownerId, "slack", "slack");

  if (!accessToken) {
    const blocked = createSyncResult(
      connectorId,
      "blocked",
      0,
      0,
      `${connector.name} OAuth 연결이 필요합니다.`
    );
    await addSyncHistory(ownerId, blocked);
    return blocked;
  }

  try {
    if (connectorId === "gmail") {
      const messages = await fetchGmailMessages(ownerId, accessToken, options);
      await upsertGmailMessages(ownerId, messages);
      await Promise.all(
        messages.map((message) =>
          addExternalIdentityMatch(
            ownerId,
            matchExternalIdentity({
              source: "gmail",
              externalId: message.externalId,
              email: extractEmail(message.sender),
              candidateName: message.sender
            })
          )
        )
      );
      const result = createSyncResult(
        connectorId,
        "success",
        messages.length,
        messages.length,
        "Gmail API 데이터를 External Index와 CRM 연결 후보로 정규화했습니다."
      );
      await addSyncHistory(ownerId, result);
      return result;
    }

    if (connectorId === "calendar") {
      const events = await fetchCalendarEvents(accessToken, options);
      await upsertCalendarEvents(ownerId, events);
      await Promise.all(
        events.flatMap((event) =>
          event.attendees.map((email) =>
            addExternalIdentityMatch(
              ownerId,
              matchExternalIdentity({
                source: "calendar",
                externalId: event.externalId,
                email,
                candidateName: email
              })
            )
          )
        )
      );
      const result = createSyncResult(
        connectorId,
        "success",
        events.length,
        events.length,
        "Google Calendar API 데이터를 일정/회의 연결 후보로 정규화했습니다."
      );
      await addSyncHistory(ownerId, result);
      return result;
    }

    if (connectorId === "slack") {
      const messages = await fetchSlackMessages(ownerId, accessToken, options);
      await upsertSlackMessages(ownerId, messages);
      const result = createSyncResult(
        connectorId,
        "success",
        messages.length,
        messages.length,
        "Slack API 데이터를 프로젝트 활동/결정 후보로 정규화했습니다."
      );
      await addSyncHistory(ownerId, result);
      return result;
    }

    const result = await connector.sync({ type: "manual", limit: options.limit });
    await addSyncHistory(ownerId, result);
    return result;
  } catch (error) {
    const failed = createSyncResult(
      connectorId,
      "failed",
      0,
      0,
      error instanceof Error ? error.message : "동기화에 실패했습니다."
    );
    await addSyncHistory(ownerId, failed);
    return failed;
  }
}

export async function getIntegrationStatusSummary() {
  const statuses = await Promise.all(
    connectorRegistry.list().map((connector) => connector.getStatus())
  );
  return {
    connected: statuses.filter((status) => status.status === "connected").length,
    mock: statuses.filter((status) => status.isMock).length,
    needsPermission: statuses.filter((status) => status.status === "needs_permission").length,
    syncEnabled: statuses.filter((status) => status.syncEnabled).length
  };
}

async function fetchGmailMessages(
  ownerId: string,
  accessToken: string,
  options: ManualSyncOptions
) {
  const listUrl = buildGmailMessageListUrl(options.limit);
  const list = await fetchJson<{ messages?: Array<{ id: string }> }>(listUrl, accessToken);
  const messageIds = list.messages || [];

  const details = await Promise.all(
    messageIds.map(async (message) => {
      const detailUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}`
      );
      detailUrl.searchParams.set("format", "metadata");
      detailUrl.searchParams.append("metadataHeaders", "From");
      detailUrl.searchParams.append("metadataHeaders", "To");
      detailUrl.searchParams.append("metadataHeaders", "Subject");
      detailUrl.searchParams.append("metadataHeaders", "Date");
      const detail = await fetchJson<GmailMessageDetail>(detailUrl, accessToken);
      return detail;
    })
  );
  const now = new Date().toISOString();
  await upsertGmailThreads(
    ownerId,
    groupGmailThreads(
      details.map((detail) => {
        const headers = gmailHeaders(detail);
        return {
          id: detail.id,
          threadId: detail.threadId || detail.id,
          subject: headers.subject || "(제목 없음)",
          receivedAt: safeIsoDate(headers.date, now)
        };
      })
    )
  );
  await upsertGmailAttachments(
    ownerId,
    details.flatMap((detail) =>
      collectGmailAttachments(detail.payload).map((attachment) => ({
        id: `gmail_attachment_${detail.id}_${attachment.attachmentId}`,
        messageId: detail.id,
        attachmentId: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        createdAt: now
      }))
    )
  );

  return details.map((detail) => {
      const headers = gmailHeaders(detail);
      return normalizeExternalMessage({
        integrationId: "gmail",
        externalId: detail.id,
        source: "gmail",
        sender: headers.from || "unknown",
        recipients: headers.to ? [headers.to] : [],
        subject: headers.subject || "(제목 없음)",
        bodyText: detail.snippet || "",
        receivedAt: safeIsoDate(headers.date, now)
      });
    });
}

async function fetchCalendarEvents(accessToken: string, options: ManualSyncOptions) {
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", new Date(Date.now() - options.days * 86400000).toISOString());
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(options.limit));
  const data = await fetchJson<{ items?: CalendarEventDetail[] }>(url, accessToken);

  return (data.items || []).map((event) =>
    normalizeExternalEvent({
      integrationId: "calendar",
      externalId: event.id,
      title: event.summary || "(제목 없음)",
      description: event.description || "",
      startTime: event.start?.dateTime || event.start?.date || new Date().toISOString(),
      endTime: event.end?.dateTime || event.end?.date || new Date().toISOString(),
      attendees: (event.attendees || []).map((attendee) => attendee.email).filter(Boolean),
      location: event.location || ""
    })
  );
}

async function fetchSlackMessages(
  ownerId: string,
  accessToken: string,
  options: ManualSyncOptions
) {
  const channelsUrl = new URL("https://slack.com/api/conversations.list");
  channelsUrl.searchParams.set("types", "public_channel,private_channel");
  channelsUrl.searchParams.set("limit", String(Math.min(options.limit, 20)));
  const channels = await fetchSlackJson<{
    ok?: boolean;
    error?: string;
    channels?: Array<{ id: string; name: string }>;
  }>(
    channelsUrl,
    accessToken
  );
  await upsertSlackChannels(
    ownerId,
    (channels.channels || []).map((channel) => ({
      id: `slack_channel_${channel.id}`,
      channelId: channel.id,
      name: channel.name,
      isPrivate: false,
      updatedAt: new Date().toISOString()
    }))
  );
  const firstChannel = channels.channels?.[0];
  if (!firstChannel) return [];

  const historyUrl = new URL("https://slack.com/api/conversations.history");
  historyUrl.searchParams.set("channel", firstChannel.id);
  historyUrl.searchParams.set("limit", String(options.limit));
  historyUrl.searchParams.set("oldest", String(Math.floor((Date.now() - options.days * 86400000) / 1000)));
  const history = await fetchSlackJson<{
    ok?: boolean;
    error?: string;
    messages?: Array<{ ts: string; user?: string; text?: string }>;
  }>(historyUrl, accessToken);

  return (history.messages || []).map((message) =>
    normalizeExternalMessage({
      integrationId: "slack",
      externalId: `${firstChannel.id}_${message.ts}`,
      source: "slack",
      sender: message.user || firstChannel.name,
      recipients: [firstChannel.name],
      subject: `#${firstChannel.name}`,
      bodyText: message.text || "",
      receivedAt: new Date(Number(message.ts.split(".")[0]) * 1000).toISOString()
    })
  );
}

async function fetchJson<T>(url: URL, accessToken: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`External API 호출 실패: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function fetchSlackJson<T extends { ok?: boolean; error?: string }>(
  url: URL,
  accessToken: string
): Promise<T> {
  const data = await fetchJson<T>(url, accessToken);
  if (data.ok === false) throw new Error(data.error || "Slack API 호출 실패");
  return data;
}

function createSyncResult(
  connectorId: string,
  status: ConnectorSyncResult["status"],
  readCount: number,
  normalizedCount: number,
  message: string
): ConnectorSyncResult {
  return {
    connectorId,
    status,
    readCount,
    normalizedCount,
    historyId: `sync_${connectorId}_${Date.now()}`,
    message,
    ranAt: new Date().toISOString()
  };
}

function extractEmail(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0] || value;
}

function collectGmailAttachments(payload?: GmailMessageDetail["payload"]) {
  const parts = payload?.parts || [];
  return parts
    .filter((part) => part.body?.attachmentId)
    .map((part) => ({
      attachmentId: part.body?.attachmentId || "",
      fileName: part.filename || "attachment",
      mimeType: part.mimeType || "application/octet-stream",
      size: part.body?.size || 0
    }));
}

function gmailHeaders(detail: GmailMessageDetail) {
  return Object.fromEntries(
    (detail.payload?.headers || []).map((header) => [
      header.name.toLowerCase(),
      header.value
    ])
  );
}

function safeIsoDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

type GmailMessageDetail = {
  id: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: Array<{
      filename?: string;
      mimeType?: string;
      body?: { attachmentId?: string; size?: number };
    }>;
  };
};

type CalendarEventDetail = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email: string }>;
  location?: string;
};
