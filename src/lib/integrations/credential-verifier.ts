import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { getAutomationApp } from "../automation/app-registry";

export type CredentialVerificationResult = {
  accountLabel: string;
  providerAccountId: string | null;
};

export type CredentialVerificationCode =
  | "UNSUPPORTED_CREDENTIAL_APP"
  | "MISSING_CREDENTIAL_FIELD"
  | "UNSAFE_PROVIDER_URL"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESPONSE_INVALID";

export class IntegrationCredentialError extends Error {
  constructor(public readonly code: CredentialVerificationCode, message: string, public readonly status = 400) {
    super(`${code}: ${message}`);
    this.name = "IntegrationCredentialError";
  }
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type CredentialVerifier = (values: Record<string, string>, fetcher: Fetcher) => Promise<CredentialVerificationResult>;

export async function verifyIntegrationCredential(
  appId: string,
  values: Record<string, string>,
  fetcher: Fetcher = fetch,
): Promise<CredentialVerificationResult> {
  const app = getAutomationApp(appId);
  if (!app?.verificationKind) throw coded("UNSUPPORTED_CREDENTIAL_APP", "이 앱은 키 직접 연결을 지원하지 않습니다.");
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value).trim()]));
  const missing = app.credentialFields.filter((item) => item.required && !normalized[item.id]);
  if (missing.length) throw coded("MISSING_CREDENTIAL_FIELD", `${missing.map((item) => item.label).join(", ")} 값을 입력하세요.`);
  const verifier = VERIFY[app.verificationKind];
  if (!verifier) throw coded("UNSUPPORTED_CREDENTIAL_APP", "이 앱의 검증 방식이 준비되지 않았습니다.");
  return verifier(normalized, fetcher);
}

export function isIntegrationCredentialError(error: unknown): error is IntegrationCredentialError {
  return error instanceof IntegrationCredentialError;
}

const VERIFY: Record<string, CredentialVerifier> = {
  notion: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.notion.com/v1/users/me", {
      headers: { Authorization: `Bearer ${values.integrationToken}`, "Notion-Version": "2022-06-28" },
    });
    return identity(labelOf(data, "name", "bot.workspace_name") || "Notion", idOf(data, "id"));
  },
  github: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.github.com/user", {
      headers: { Authorization: `Bearer ${values.personalAccessToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    return identity(labelOf(data, "name", "login") || "GitHub", idOf(data, "id"));
  },
  discord: async (values, fetcher) => {
    const headers = { Authorization: `Bot ${values.botToken}` };
    const user = await requestJson(fetcher, "https://discord.com/api/v10/users/@me", { headers });
    const guild = await requestJson(fetcher, `https://discord.com/api/v10/guilds/${encodeURIComponent(values.serverId)}`, { headers });
    const channel = await requestJson(fetcher, `https://discord.com/api/v10/channels/${encodeURIComponent(values.channelId)}`, { headers });
    if (idOf(channel, "guild_id") && idOf(channel, "guild_id") !== values.serverId) {
      throw coded("PROVIDER_REJECTED", "선택한 채널이 입력한 서버에 속하지 않습니다.");
    }
    return identity(`${labelOf(user, "global_name", "username") || "Discord Bot"} · ${labelOf(guild, "name") || values.serverId}`, idOf(user, "id"));
  },
  telegram: async (values, fetcher) => {
    const base = `https://api.telegram.org/bot${encodeURIComponent(values.botToken)}`;
    const me = unwrapTelegram(await requestJson(fetcher, `${base}/getMe`));
    const chat = unwrapTelegram(await requestJson(fetcher, `${base}/getChat?chat_id=${encodeURIComponent(values.chatId)}`));
    return identity(`${labelOf(me, "username", "first_name") || "Telegram Bot"} · ${labelOf(chat, "title", "username") || values.chatId}`, idOf(me, "id"));
  },
  airtable: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.airtable.com/v0/meta/whoami", { headers: bearer(values.personalAccessToken) });
    return identity(labelOf(data, "email") || "Airtable", idOf(data, "id"));
  },
  trello: async (values, fetcher) => {
    const url = new URL("https://api.trello.com/1/members/me");
    url.searchParams.set("key", values.apiKey);
    url.searchParams.set("token", values.apiToken);
    const data = await requestJson(fetcher, url);
    return identity(labelOf(data, "fullName", "username") || "Trello", idOf(data, "id"));
  },
  asana: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://app.asana.com/api/1.0/users/me", { headers: bearer(values.personalAccessToken) });
    const user = objectAt(data, "data") || data;
    return identity(labelOf(user, "name", "email") || "Asana", idOf(user, "gid"));
  },
  jira: async (values, fetcher) => {
    const base = publicHttpsBase(values.siteUrl);
    const data = await requestJson(fetcher, new URL("/rest/api/3/myself", base), {
      headers: { Authorization: `Basic ${Buffer.from(`${values.email}:${values.apiToken}`).toString("base64")}`, Accept: "application/json" },
    });
    return identity(labelOf(data, "displayName", "emailAddress") || values.email, idOf(data, "accountId"));
  },
  linear: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: values.personalApiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query DreamwishViewer { viewer { id name email } }" }),
    });
    const viewer = objectAt(data, "data.viewer");
    if (!viewer) throw coded("PROVIDER_RESPONSE_INVALID", "Linear 계정 정보를 확인하지 못했습니다.", 502);
    return identity(labelOf(viewer, "name", "email") || "Linear", idOf(viewer, "id"));
  },
  hubspot: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.hubapi.com/account-info/v3/details", { headers: bearer(values.privateAppToken) });
    return identity(labelOf(data, "companyName", "portalId") || "HubSpot", idOf(data, "portalId"));
  },
  salesforce: async (values, fetcher) => {
    const base = publicHttpsBase(values.instanceUrl);
    const data = await requestJson(fetcher, new URL("/services/oauth2/userinfo", base), { headers: bearer(values.accessToken) });
    return identity(labelOf(data, "display_name", "username", "email") || "Salesforce", idOf(data, "user_id", "sub"));
  },
  stripe: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.stripe.com/v1/account", {
      headers: { Authorization: `Basic ${Buffer.from(`${values.apiKey}:`).toString("base64")}` },
    });
    return identity(labelOf(data, "business_profile.name", "email") || "Stripe", idOf(data, "id"));
  },
  shopify: async (values, fetcher) => {
    const raw = values.storeDomain.includes("://") ? values.storeDomain : `https://${values.storeDomain}`;
    const base = publicHttpsBase(raw);
    if (!base.hostname.toLowerCase().endsWith(".myshopify.com")) throw coded("UNSAFE_PROVIDER_URL", "Shopify Store Domain은 myshopify.com 도메인이어야 합니다.");
    const data = await requestJson(fetcher, new URL("/admin/api/2025-04/shop.json", base), {
      headers: { "X-Shopify-Access-Token": values.adminAccessToken },
    });
    const shop = objectAt(data, "shop") || data;
    return identity(labelOf(shop, "name", "email") || base.hostname, idOf(shop, "id"));
  },
  wordpress: async (values, fetcher) => {
    const base = publicHttpsBase(values.siteUrl);
    const data = await requestJson(fetcher, new URL("/wp-json/wp/v2/users/me?context=edit", base), {
      headers: { Authorization: `Basic ${Buffer.from(`${values.username}:${values.applicationPassword}`).toString("base64")}` },
    });
    return identity(labelOf(data, "name", "slug") || values.username, idOf(data, "id"));
  },
  facebook: async (values, fetcher) => {
    const url = new URL(`https://graph.facebook.com/v22.0/${encodeURIComponent(values.pageId)}`);
    url.searchParams.set("fields", "id,name");
    url.searchParams.set("access_token", values.pageAccessToken);
    const data = await requestJson(fetcher, url);
    return identity(labelOf(data, "name") || "Facebook Page", idOf(data, "id"));
  },
  instagram: async (values, fetcher) => {
    const url = new URL(`https://graph.facebook.com/v22.0/${encodeURIComponent(values.businessAccountId)}`);
    url.searchParams.set("fields", "id,username,name");
    url.searchParams.set("access_token", values.accessToken);
    const data = await requestJson(fetcher, url);
    return identity(labelOf(data, "username", "name") || "Instagram", idOf(data, "id"));
  },
  x: async (values, fetcher) => {
    const url = "https://api.x.com/2/users/me";
    const oauth = {
      oauth_consumer_key: values.apiKey,
      oauth_nonce: randomBytes(18).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: values.accessToken,
      oauth_version: "1.0",
    };
    const signatureBase = `GET&${percent(url)}&${percent(Object.entries(oauth).sort().map(([key, value]) => `${percent(key)}=${percent(value)}`).join("&"))}`;
    const signature = createHmac("sha1", `${percent(values.apiSecret)}&${percent(values.accessTokenSecret)}`).update(signatureBase).digest("base64");
    const authorization = `OAuth ${Object.entries({ ...oauth, oauth_signature: signature }).sort().map(([key, value]) => `${percent(key)}="${percent(value)}"`).join(", ")}`;
    const data = await requestJson(fetcher, url, { headers: { Authorization: authorization } });
    const user = objectAt(data, "data") || data;
    return identity(labelOf(user, "name", "username") || "X", idOf(user, "id"));
  },
  linkedin: async (values, fetcher) => {
    const data = await requestJson(fetcher, "https://api.linkedin.com/v2/userinfo", { headers: bearer(values.accessToken) });
    return identity(labelOf(data, "name", "email", "preferred_username") || "LinkedIn", values.personOrOrganizationId || idOf(data, "sub"));
  },
  openai: async (values, fetcher) => {
    await requestJson(fetcher, "https://api.openai.com/v1/models", { headers: bearer(values.apiKey) });
    return identity("OpenAI API", null);
  },
};

async function requestJson(fetcher: Fetcher, input: string | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetcher(input, { ...init, redirect: "error", signal: controller.signal });
    if (!response.ok) throw responseError(response.status);
    const data = await response.json().catch(() => null) as unknown;
    if (!data || typeof data !== "object") throw coded("PROVIDER_RESPONSE_INVALID", "제공자 응답을 확인하지 못했습니다.", 502);
    return data as Record<string, unknown>;
  } catch (error) {
    if (isIntegrationCredentialError(error)) throw error;
    throw coded("PROVIDER_UNAVAILABLE", "제공자 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

function responseError(status: number) {
  if (status === 401 || status === 403) return coded("PROVIDER_AUTH_FAILED", "입력한 인증 정보를 제공자가 거부했습니다.", 401);
  if (status === 429) return coded("PROVIDER_RATE_LIMITED", "제공자 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.", 429);
  if (status >= 500) return coded("PROVIDER_UNAVAILABLE", "제공자 서버에 일시적인 문제가 있습니다.", 503);
  return coded("PROVIDER_REJECTED", `제공자가 연결 요청을 거부했습니다 (${status}).`, 400);
}

function publicHttpsBase(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw coded("UNSAFE_PROVIDER_URL", "올바른 HTTPS 주소를 입력하세요."); }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (url.protocol !== "https:" || url.username || url.password || !hostname || isUnsafeHostname(hostname)) {
    throw coded("UNSAFE_PROVIDER_URL", "공개 HTTPS 주소만 사용할 수 있습니다.");
  }
  url.hash = "";
  url.search = "";
  return url;
}

function isUnsafeHostname(hostname: string) {
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  if (isIP(hostname) === 4) {
    const parts = hostname.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254)
      || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
      || parts[0] >= 224;
  }
  if (isIP(hostname) === 6) return hostname === "::1" || hostname === "::" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe8") || hostname.startsWith("fe9") || hostname.startsWith("fea") || hostname.startsWith("feb");
  return false;
}

function unwrapTelegram(data: Record<string, unknown>) {
  if (data.ok !== true || !objectAt(data, "result")) throw coded("PROVIDER_AUTH_FAILED", "Telegram Bot 또는 Chat 정보를 확인하지 못했습니다.", 401);
  return objectAt(data, "result")!;
}

function objectAt(value: unknown, path: string): Record<string, unknown> | null {
  let current: unknown = value;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current && typeof current === "object" ? current as Record<string, unknown> : null;
}

function scalarAt(value: unknown, path: string): string | null {
  let current: unknown = value;
  for (const key of path.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" || typeof current === "number" ? String(current) : null;
}

function labelOf(value: unknown, ...paths: string[]) { return paths.map((path) => scalarAt(value, path)?.trim()).find(Boolean) || null; }
function idOf(value: unknown, ...paths: string[]) { return paths.map((path) => scalarAt(value, path)?.trim()).find(Boolean) || null; }
function identity(accountLabel: string, providerAccountId: string | null): CredentialVerificationResult { return { accountLabel, providerAccountId }; }
function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }
function percent(value: string) { return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`); }
function coded(code: CredentialVerificationCode, message: string, status = 400) { return new IntegrationCredentialError(code, message, status); }
