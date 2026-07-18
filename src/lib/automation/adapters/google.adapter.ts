import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { arrayValue, booleanValue, compactObject, numberValue, objectValue, text } from "./adapter-utils";
import { executeOAuthJson } from "./oauth-json-client";
import { executeOAuthBinary, executeOAuthRaw } from "./oauth-json-client";
import { loadActionFile, saveRemoteFile } from "./file-transfer";

export const googleActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("google", adapterKey, adapterVersion);
  },
  execute(input) {
    if (input.definition.appId === "gmail") return executeGmail(input);
    if (input.definition.appId === "google-sheets") return executeSheets(input);
    if (input.definition.appId === "calendar") return executeCalendar(input);
    if (input.definition.appId === "youtube") return executeYouTube(input);
    return executeDrive(input);
  }
};

async function executeGmail(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  const values = input.normalizedInput;
  const messageId = encodeURIComponent(text(values, "messageId"));
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  if (input.definition.id === "send-email") {
    if (arrayValue(values, "attachments").length > 0) throw new Error("Gmail attachments are not implemented for this adapter version.");
    return executeOAuthJson(input, { url: `${base}/messages/send`, method: "POST", body: { raw: buildRawEmail(values) } });
  }
  if (input.definition.id === "create-draft") {
    if (arrayValue(values, "attachments").length > 0) throw new Error("Gmail attachments are not implemented for this adapter version.");
    return executeOAuthJson(input, { url: `${base}/drafts`, method: "POST", body: { message: { raw: buildRawEmail(values) } } });
  }
  if (input.definition.id === "reply-email") {
    const original = await executeOAuthJson(input, {
      url: `${base}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject&metadataHeaders=Message-ID`
    });
    const headers = gmailHeaders(original.output);
    const recipient = headers.get("reply-to") || headers.get("from") || "";
    const originalMessageId = headers.get("message-id") || "";
    const threadId = String(original.output.threadId || "");
    if (!recipient || !threadId) {
      throw Object.assign(new Error("The original Gmail message has no reply recipient or thread."), {
        code: "ACTION_FAILED",
        retryable: false
      });
    }
    const sent = await executeOAuthJson(input, {
      url: `${base}/messages/send`,
      method: "POST",
      body: {
        threadId,
        raw: buildReplyEmail({
          to: recipient,
          subject: headers.get("subject") || "",
          messageId: originalMessageId,
          body: text(values, "body")
        })
      }
    });
    return combineAdapterResults(original, sent);
  }
  if (input.definition.id === "forward-email") {
    const original = await executeOAuthJson(input, {
      url: `${base}/messages/${messageId}?format=raw`
    });
    const raw = typeof original.output.raw === "string" ? original.output.raw : "";
    if (!raw) throw permanent("Gmail did not return the original message.");
    const sent = await executeOAuthJson(input, {
      url: `${base}/messages/send`,
      method: "POST",
      body: { raw: buildForwardEmail(text(values, "to"), text(values, "message"), raw) }
    });
    return combineAdapterResults(original, sent);
  }
  if (input.definition.id === "permanently-delete-email") return executeOAuthJson(input, { url: `${base}/messages/${messageId}`, method: "DELETE" });
  if (["mark-read", "mark-unread", "archive-email", "add-label", "remove-label"].includes(input.definition.id)) {
    const labelId = input.definition.id === "add-label" || input.definition.id === "remove-label" ? text(values, "labelId") : input.definition.id === "archive-email" ? "INBOX" : "UNREAD";
    const addLabelIds = ["mark-unread", "add-label"].includes(input.definition.id) ? [labelId] : [];
    const removeLabelIds = ["mark-read", "archive-email", "remove-label"].includes(input.definition.id) ? [labelId] : [];
    return executeOAuthJson(input, { url: `${base}/messages/${messageId}/modify`, method: "POST", body: { addLabelIds, removeLabelIds } });
  }
  if (input.definition.id === "download-attachment") {
    return executeOAuthJson(input, { url: `${base}/messages/${messageId}/attachments/${encodeURIComponent(text(values, "attachmentId"))}` });
  }
  if (input.definition.id === "save-attachment") {
    const attachmentId = text(values, "attachmentId");
    const downloaded = await executeOAuthJson(input, {
      url: `${base}/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`
    });
    const encoded = typeof downloaded.output.data === "string" ? downloaded.output.data : "";
    if (!encoded) throw permanent("Gmail did not return attachment data.");
    const bytes = Buffer.from(encoded.replace(/-/gu, "+").replace(/_/gu, "/"), "base64");
    const file = await saveRemoteFile({
      ownerId: input.ownerId,
      bytes,
      name: `gmail-attachment-${attachmentId}`,
      contentType: "application/octet-stream"
    });
    return {
      ...downloaded,
      output: { id: file.id, name: file.name, size: file.size, destination: text(values, "destination") }
    };
  }
  const url = new URL(`${base}/messages`);
  url.searchParams.set("q", text(values, "query"));
  url.searchParams.set("maxResults", String(numberValue(values, "limit", 25)));
  return executeOAuthJson(input, { url: url.toString() });
}

async function executeYouTube(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  const values = input.normalizedInput;
  if (input.definition.id === "upload-video") {
    const video = await loadActionFile(input.ownerId, values.video, "video.bin");
    const boundary = `dreamwish-${input.idempotencyKey.replace(/[^A-Za-z0-9]/gu, "").slice(0, 40)}`;
    const metadata = JSON.stringify({
      snippet: { title: text(values, "title"), description: text(values, "description") },
      status: { privacyStatus: text(values, "privacy", "private") }
    });
    const body = multipartRelated(boundary, metadata, video.contentType, video.bytes);
    return executeOAuthRaw(input, {
      url: "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=multipart",
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    });
  }
  if (input.definition.id === "set-thumbnail") {
    const thumbnail = await loadActionFile(input.ownerId, values.thumbnail, "thumbnail.jpg");
    if (thumbnail.bytes.byteLength > 2 * 1024 * 1024) {
      throw Object.assign(new Error("YouTube 썸네일은 2 MiB 이하여야 합니다."), { code: "ACTION_INPUT_TOO_LARGE", retryable: false });
    }
    return executeOAuthRaw(input, {
      url: `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(text(values, "videoId"))}&uploadType=media`,
      method: "POST",
      headers: { "Content-Type": thumbnail.contentType },
      body: thumbnail.bytes
    });
  }
  if (input.definition.id === "add-playlist-item") {
    return executeOAuthJson(input, {
      url: "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
      method: "POST",
      body: {
        snippet: compactObject({
          playlistId: text(values, "playlistId"),
          position: values.position === undefined ? undefined : numberValue(values, "position"),
          resourceId: { kind: "youtube#video", videoId: text(values, "videoId") }
        })
      }
    });
  }

  const videoId = text(values, "videoId");
  const current = await executeOAuthJson(input, {
    url: `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(videoId)}`
  });
  const item = Array.isArray(current.output.items)
    ? current.output.items[0] as Record<string, unknown> | undefined
    : undefined;
  if (!item) {
    throw Object.assign(new Error("The YouTube video was not found or is not editable by this account."), {
      code: "ACTION_FAILED",
      retryable: false
    });
  }
  const currentSnippet = item.snippet && typeof item.snippet === "object"
    ? item.snippet as Record<string, unknown>
    : {};
  const updateSnippet = values.title !== undefined || values.description !== undefined;
  const updateStatus = values.privacy !== undefined;
  const parts = [updateSnippet ? "snippet" : null, updateStatus ? "status" : null].filter(Boolean);
  if (parts.length === 0) {
    throw Object.assign(new Error("At least one YouTube video field must be changed."), {
      code: "ACTION_INPUT_INVALID",
      retryable: false
    });
  }
  const updated = await executeOAuthJson(input, {
    url: `https://www.googleapis.com/youtube/v3/videos?part=${parts.join(",")}`,
    method: "PUT",
    body: compactObject({
      id: videoId,
      snippet: updateSnippet ? {
        ...youtubeSnippetForUpdate(currentSnippet),
        ...(values.title !== undefined ? { title: text(values, "title") } : {}),
        ...(values.description !== undefined ? { description: text(values, "description") } : {})
      } : undefined,
      status: updateStatus ? { privacyStatus: text(values, "privacy") } : undefined
    })
  });
  return combineAdapterResults(current, updated);
}

function executeSheets(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const spreadsheetId = encodeURIComponent(text(values, "spreadsheetId"));
  const sheet = text(values, "sheet");
  const range = input.definition.id === "get-row" || input.definition.id === "update-row" ? `${sheet}!${numberValue(values, "row")}:${numberValue(values, "row")}` : `${sheet}!A:ZZZ`;
  const valuesBase = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  if (input.definition.id === "add-row") return executeOAuthJson(input, { url: `${valuesBase}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, method: "POST", body: { values: [rowValues(values)] } });
  if (input.definition.id === "update-row") return executeOAuthJson(input, { url: `${valuesBase}?valueInputOption=USER_ENTERED`, method: "PUT", body: { values: [rowValues(values)] } });
  if (input.definition.id === "get-row") return executeOAuthJson(input, { url: valuesBase });
  if (input.definition.id === "get-sheet") return executeOAuthJson(input, { url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false` });
  if (input.definition.id === "create-sheet") return executeOAuthJson(input, {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, method: "POST",
    body: { requests: [{ addSheet: { properties: compactObject({ title: text(values, "title"), gridProperties: compactObject({ rowCount: numberValue(values, "rowCount", 1000), columnCount: numberValue(values, "columnCount", 26) }) }) } }] }
  });
  const rowIndex = Math.max(0, numberValue(values, "row") - 1);
  return executeOAuthJson(input, {
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, method: "POST",
    body: { requests: [{ deleteDimension: { range: { sheetId: Number(sheet), dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } } }] }
  });
}

function executeCalendar(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const calendarId = encodeURIComponent(text(values, "calendarId", "primary"));
  const base = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
  if (input.definition.id === "delete-event") return executeOAuthJson(input, { url: `${base}/${encodeURIComponent(text(values, "eventId"))}?sendUpdates=${booleanValue(values, "notifyGuests") ? "all" : "none"}`, method: "DELETE" });
  if (input.definition.id === "get-events") {
    const url = new URL(base);
    if (values.start) url.searchParams.set("timeMin", text(values, "start"));
    if (values.end) url.searchParams.set("timeMax", text(values, "end"));
    if (values.query) url.searchParams.set("q", text(values, "query"));
    url.searchParams.set("singleEvents", "true");
    return executeOAuthJson(input, { url: url.toString() });
  }
  const body = calendarBody(values);
  if (input.definition.id === "create-event") return executeOAuthJson(input, { url: base, method: "POST", body });
  return executeOAuthJson(input, { url: `${base}/${encodeURIComponent(text(values, "eventId"))}`, method: "PATCH", body });
}

async function executeDrive(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const base = "https://www.googleapis.com/drive/v3/files";
  if (input.definition.id === "upload-file") {
    const file = await loadActionFile(input.ownerId, values.file, text(values, "name", "upload.bin"));
    const boundary = `dreamwish-${input.idempotencyKey.replace(/[^A-Za-z0-9]/gu, "").slice(0, 40)}`;
    const metadata = JSON.stringify(compactObject({
      name: text(values, "name", file.name),
      parents: values.folderId ? [text(values, "folderId")] : undefined
    }));
    return executeOAuthRaw(input, {
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink",
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipartRelated(boundary, metadata, file.contentType, file.bytes)
    });
  }
  if (input.definition.id === "download-file") {
    const fileId = encodeURIComponent(text(values, "fileId"));
    const metadata = await executeOAuthJson(input, { url: `${base}/${fileId}?fields=id,name,mimeType,size` });
    const downloaded = await executeOAuthBinary(input, { url: `${base}/${fileId}?alt=media` });
    const file = await saveRemoteFile({
      ownerId: input.ownerId,
      bytes: downloaded.bytes,
      name: typeof metadata.output.name === "string" ? metadata.output.name : `drive-${fileId}`,
      contentType: typeof metadata.output.mimeType === "string" ? metadata.output.mimeType : downloaded.contentType
    });
    return {
      output: { id: file.id, name: file.name, size: file.size, mimeType: file.mimeType },
      apiRequestId: downloaded.apiRequestId || metadata.apiRequestId,
      rateLimitRemaining: downloaded.rateLimitRemaining,
      adapterLatencyMs: (metadata.adapterLatencyMs || 0) + downloaded.adapterLatencyMs
    };
  }
  if (input.definition.id === "create-folder") return executeOAuthJson(input, { url: base, method: "POST", body: compactObject({ name: text(values, "name"), mimeType: "application/vnd.google-apps.folder", parents: values.parentId ? [text(values, "parentId")] : undefined }) });
  if (input.definition.id === "share-file") return executeOAuthJson(input, { url: `${base}/${encodeURIComponent(text(values, "fileId"))}/permissions?sendNotificationEmail=${booleanValue(values, "notify", true)}`, method: "POST", body: { type: "user", role: text(values, "role"), emailAddress: text(values, "email") } });
  if (input.definition.id === "move-file") return executeOAuthJson(input, { url: `${base}/${encodeURIComponent(text(values, "fileId"))}?addParents=${encodeURIComponent(text(values, "destinationFolderId"))}&fields=id,name,parents`, method: "PATCH", body: {} });
  const url = new URL(base);
  const clauses = [`name contains '${escapeDriveQuery(text(values, "query"))}'`, "trashed = false"];
  if (values.folderId) clauses.push(`'${escapeDriveQuery(text(values, "folderId"))}' in parents`);
  url.searchParams.set("q", clauses.join(" and "));
  url.searchParams.set("pageSize", String(numberValue(values, "limit", 25)));
  url.searchParams.set("fields", "files(id,name,mimeType,parents,webViewLink,modifiedTime),nextPageToken");
  return executeOAuthJson(input, { url: url.toString() });
}

function buildRawEmail(input: ActionAdapterExecutionInput["normalizedInput"]) {
  const clean = (value: string) => { if (/\r|\n/u.test(value)) throw new Error("Email headers contain invalid line breaks."); return value; };
  const headers = [`To: ${clean(text(input, "to"))}`];
  if (input.cc) headers.push(`Cc: ${clean(text(input, "cc"))}`);
  if (input.bcc) headers.push(`Bcc: ${clean(text(input, "bcc"))}`);
  headers.push(`Subject: ${clean(text(input, "subject"))}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${text(input, "body")}`, "utf8").toString("base64url");
}

function buildReplyEmail(input: { to: string; subject: string; messageId: string; body: string }) {
  const clean = (value: string) => {
    if (/\r|\n/u.test(value)) throw new Error("Email headers contain invalid line breaks.");
    return value;
  };
  const subject = /^(re|reply):/iu.test(input.subject) ? input.subject : `Re: ${input.subject}`;
  const headers = [
    `To: ${clean(input.to)}`,
    `Subject: ${clean(subject)}`,
    ...(input.messageId ? [`In-Reply-To: ${clean(input.messageId)}`, `References: ${clean(input.messageId)}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8"
  ];
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${input.body}`, "utf8").toString("base64url");
}

function buildForwardEmail(to: string, message: string, originalRaw: string) {
  const cleanTo = to.trim();
  if (!cleanTo || /\r|\n/u.test(cleanTo)) throw permanent("Forward recipient is invalid.", "ACTION_INPUT_INVALID");
  const boundary = `dreamwish-forward-${Date.now().toString(36)}`;
  const original = Buffer.from(originalRaw.replace(/-/gu, "+").replace(/_/gu, "/"), "base64").toString("base64");
  const mime = [
    `To: ${cleanTo}`,
    "Subject: Fwd: forwarded message",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary=${boundary}`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    message,
    `--${boundary}`,
    "Content-Type: message/rfc822; name=forwarded-message.eml",
    "Content-Transfer-Encoding: base64",
    "Content-Disposition: attachment; filename=forwarded-message.eml",
    "",
    original,
    `--${boundary}--`
  ].join("\r\n");
  return Buffer.from(mime, "utf8").toString("base64url");
}

function multipartRelated(boundary: string, metadata: string, contentType: string, bytes: Buffer) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`, "utf8"),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf8")
  ]);
}

function permanent(message: string, code = "ACTION_FAILED") {
  return Object.assign(new Error(message), { code, retryable: false });
}

function keys(input: Record<string, string[]>) {
  return new Set(Object.entries(input).flatMap(([appId, actionIds]) => actionIds.map((actionId) => `${appId}.${actionId}`)));
}

function gmailHeaders(output: Record<string, unknown>) {
  const payload = output.payload && typeof output.payload === "object"
    ? output.payload as Record<string, unknown>
    : {};
  const rawHeaders = Array.isArray(payload.headers) ? payload.headers : [];
  return new Map(rawHeaders.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const header = value as Record<string, unknown>;
    return typeof header.name === "string" && typeof header.value === "string"
      ? [[header.name.toLowerCase(), header.value] as const]
      : [];
  }));
}

function combineAdapterResults(first: ActionAdapterExecutionResult, last: ActionAdapterExecutionResult): ActionAdapterExecutionResult {
  return {
    ...last,
    apiRequestId: last.apiRequestId || first.apiRequestId,
    rateLimitRemaining: last.rateLimitRemaining ?? first.rateLimitRemaining,
    adapterLatencyMs: (first.adapterLatencyMs || 0) + (last.adapterLatencyMs || 0)
  };
}

function youtubeSnippetForUpdate(snippet: Record<string, unknown>) {
  return compactObject({
    title: typeof snippet.title === "string" ? snippet.title : undefined,
    description: typeof snippet.description === "string" ? snippet.description : "",
    tags: Array.isArray(snippet.tags) ? snippet.tags : undefined,
    categoryId: typeof snippet.categoryId === "string" ? snippet.categoryId : undefined,
    defaultLanguage: typeof snippet.defaultLanguage === "string" ? snippet.defaultLanguage : undefined,
    defaultAudioLanguage: typeof snippet.defaultAudioLanguage === "string" ? snippet.defaultAudioLanguage : undefined
  });
}

function rowValues(input: ActionAdapterExecutionInput["normalizedInput"]) { const columns = input.columns; return Array.isArray(columns) ? columns : Object.values(objectValue(input, "columns")); }
function calendarBody(input: ActionAdapterExecutionInput["normalizedInput"]) { return compactObject({ summary: text(input, "title"), description: input.description ? text(input, "description") : undefined, location: input.location ? text(input, "location") : undefined, start: input.start ? { dateTime: text(input, "start") } : undefined, end: input.end ? { dateTime: text(input, "end") } : undefined, attendees: arrayValue(input, "guests").map((email) => ({ email: String(email) })) }); }
function escapeDriveQuery(value: string) { return value.replace(/\\/gu, "\\\\").replace(/'/gu, "\\'"); }
