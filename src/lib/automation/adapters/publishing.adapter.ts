import { createHmac, randomBytes } from "node:crypto";
import { assertPublicDns, assertSafeUrlFormat } from "../../deep-research/safe-fetch";
import { resolveStructuredActionCredential } from "../action-credential.service";
import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { arrayValue, compactObject, text } from "./adapter-utils";
import { executeJsonRequest } from "./oauth-json-client";

export const publishingActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("publishing", adapterKey, adapterVersion);
  },
  async execute(input) {
    if (!input.connectionId) throw permanent("연결된 게시 앱 계정을 선택하세요.", "CONNECTION_REQUIRED");
    const credential = await resolveStructuredActionCredential(
      input.ownerId,
      input.connectionId,
      input.definition.appId
    );
    if (input.definition.appId === "wordpress") return executeWordPress(input, credential.values);
    if (input.definition.appId === "facebook") return executeFacebook(input, credential.values);
    if (input.definition.appId === "instagram") return executeInstagram(input, credential.values);
    if (input.definition.appId === "x") return executeX(input, credential.values);
    return executeLinkedIn(input, credential.values);
  }
};

async function executeWordPress(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const origin = assertSafeUrlFormat(required(credential.siteUrl, "WordPress Site URL")).origin;
  await assertPublicDns(new URL(origin).hostname);
  const values = input.normalizedInput;
  const id = input.definition.id;
  const targetId = id === "update-post" ? segment(text(values, "targetId")) : "";
  const path = id === "create-page" ? "/wp-json/wp/v2/pages"
    : id === "create-comment" ? "/wp-json/wp/v2/comments"
      : id === "update-post" ? `/wp-json/wp/v2/posts/${targetId}`
        : "/wp-json/wp/v2/posts";
  const content = text(values, "content");
  const body = id === "create-comment"
    ? { post: text(values, "parentId"), content }
    : compactObject({
      title: id === "update-post" ? undefined : content.split(/\r?\n/u)[0]?.slice(0, 200) || "Automation post",
      content,
      status: wordpressStatus(text(values, "visibility"))
    });
  return executeJsonRequest(input, {
    url: `${origin}${path}`,
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${required(credential.username, "WordPress Username")}:${required(credential.applicationPassword, "WordPress Application Password")}`, "utf8").toString("base64")}`
    },
    body
  });
}

async function executeFacebook(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const values = input.normalizedInput;
  const targetId = text(values, "targetId", credential.pageId);
  const token = required(credential.pageAccessToken, "Facebook Page Access Token");
  const mediaUrl = await publicMediaUrl(values.media);
  const path = input.definition.id === "create-comment"
    ? `/${segment(text(values, "parentId"))}/comments`
    : mediaUrl ? `/${segment(targetId)}/photos` : `/${segment(targetId)}/feed`;
  return executeJsonRequest(input, {
    url: `https://graph.facebook.com/v23.0${path}`,
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: input.definition.id === "create-comment"
      ? { message: text(values, "content") }
      : mediaUrl ? { url: mediaUrl, caption: text(values, "content") } : { message: text(values, "content") }
  });
}

async function executeInstagram(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const values = input.normalizedInput;
  const accountId = text(values, "targetId", credential.businessAccountId);
  const mediaUrl = await publicMediaUrl(values.media);
  if (!mediaUrl) throw permanent("Instagram 게시에는 공개 HTTPS 이미지 URL이 필요합니다.", "ACTION_INPUT_INVALID");
  const token = required(credential.accessToken, "Instagram Access Token");
  const created = await executeJsonRequest(input, {
    url: `https://graph.facebook.com/v23.0/${segment(accountId)}/media`,
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { image_url: mediaUrl, caption: text(values, "content") }
  });
  const creationId = typeof created.output.id === "string" ? created.output.id : "";
  if (!creationId) throw permanent("Instagram이 Media Container ID를 반환하지 않았습니다.");
  const published = await executeJsonRequest(input, {
    url: `https://graph.facebook.com/v23.0/${segment(accountId)}/media_publish`,
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { creation_id: creationId }
  });
  return combine(created, published);
}

async function executeX(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  if (arrayValue(input.normalizedInput, "media").length) {
    throw permanent("X 미디어 게시에는 별도 Media Upload ID가 필요합니다.", "ACTION_INPUT_INVALID");
  }
  const url = "https://api.x.com/2/tweets";
  const headers = oauth1Headers("POST", url, credential);
  const parentId = text(input.normalizedInput, "parentId");
  return executeJsonRequest(input, {
    url,
    method: "POST",
    headers,
    body: compactObject({
      text: text(input.normalizedInput, "content"),
      reply: input.definition.id === "publish-reply" ? { in_reply_to_tweet_id: required(parentId, "Reply Tweet ID") } : undefined
    })
  });
}

function executeLinkedIn(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  if (arrayValue(input.normalizedInput, "media").length) {
    throw permanent("LinkedIn 미디어 게시에는 먼저 Asset 업로드가 필요합니다.", "ACTION_INPUT_INVALID");
  }
  const rawAuthor = text(input.normalizedInput, "targetId", credential.personOrOrganizationId);
  const author = rawAuthor.startsWith("urn:li:")
    ? rawAuthor
    : `urn:li:${input.definition.id === "publish-organization-post" ? "organization" : "person"}:${required(rawAuthor, "LinkedIn Author ID")}`;
  return executeJsonRequest(input, {
    url: "https://api.linkedin.com/rest/posts",
    method: "POST",
    headers: {
      Authorization: `Bearer ${required(credential.accessToken, "LinkedIn Access Token")}`,
      "Linkedin-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0"
    },
    body: {
      author,
      commentary: text(input.normalizedInput, "content"),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false
    }
  });
}

async function publicMediaUrl(value: unknown) {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = typeof first === "string"
    ? first
    : first && typeof first === "object" && typeof (first as Record<string, unknown>).url === "string"
      ? String((first as Record<string, unknown>).url)
      : "";
  if (!raw) return "";
  const url = assertSafeUrlFormat(raw);
  await assertPublicDns(url.hostname);
  return url.toString();
}

function oauth1Headers(method: string, url: string, credential: Record<string, string>) {
  const consumerKey = required(credential.apiKey, "X API Key");
  const consumerSecret = required(credential.apiSecret, "X API Secret");
  const token = required(credential.accessToken, "X Access Token");
  const tokenSecret = required(credential.accessTokenSecret, "X Access Token Secret");
  const params: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(18).toString("base64url"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0"
  };
  const normalized = Object.entries(params).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${percent(key)}=${percent(value)}`).join("&");
  const base = `${method.toUpperCase()}&${percent(url)}&${percent(normalized)}`;
  params.oauth_signature = createHmac("sha1", `${percent(consumerSecret)}&${percent(tokenSecret)}`).update(base).digest("base64");
  return { Authorization: `OAuth ${Object.entries(params).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${percent(key)}="${percent(value)}"`).join(", ")}` };
}

function wordpressStatus(value: string) { return value === "public" ? "publish" : value === "private" ? "private" : "draft"; }
function percent(value: string) { return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function segment(value: string) { return encodeURIComponent(required(value, "Resource ID")); }
function required(value: string | undefined, label: string) { if (!value?.trim()) throw permanent(`${label}을 확인하세요.`, "CREDENTIAL_INVALID"); return value.trim(); }
function combine(first: ActionAdapterExecutionResult, last: ActionAdapterExecutionResult): ActionAdapterExecutionResult { return { ...last, adapterLatencyMs: (first.adapterLatencyMs || 0) + (last.adapterLatencyMs || 0) }; }
function permanent(message: string, code = "ACTION_FAILED") { return Object.assign(new Error(message), { code, retryable: false }); }
