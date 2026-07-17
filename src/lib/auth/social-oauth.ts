import { normalizeEmail } from "./access-control";
import type { SocialProfile, SocialProvider, SocialToken } from "./social-oauth.types";

const PROVIDERS = {
  kakao: {
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me",
    clientIdEnv: "KAKAO_CLIENT_ID",
    clientSecretEnv: "KAKAO_CLIENT_SECRET",
    redirectUriEnv: "KAKAO_REDIRECT_URI"
  },
  naver: {
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me",
    clientIdEnv: "NAVER_CLIENT_ID",
    clientSecretEnv: "NAVER_CLIENT_SECRET",
    redirectUriEnv: "NAVER_REDIRECT_URI"
  }
} as const;

export function isSocialProvider(value: string): value is SocialProvider {
  return value === "kakao" || value === "naver";
}

export function createSocialAuthorizationUrl(provider: SocialProvider, state: string) {
  const config = getProviderConfig(provider);
  const url = new URL(PROVIDERS[provider].authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("state", state);
  if (provider === "kakao") url.searchParams.set("scope", "account_email,profile_nickname");
  return url.toString();
}

export async function exchangeSocialCode(provider: SocialProvider, code: string, state?: string): Promise<SocialToken> {
  const config = getProviderConfig(provider);
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code
  });
  if (provider === "naver" && state) params.set("state", state);
  const response = await fetch(PROVIDERS[provider].tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: params,
    signal: AbortSignal.timeout(15_000)
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown; token_type?: unknown; error?: unknown };
  if (!response.ok || typeof body.access_token !== "string" || !body.access_token) {
    throw new Error(`${provider} OAuth token exchange failed.`);
  }
  return { accessToken: body.access_token, tokenType: typeof body.token_type === "string" ? body.token_type : "Bearer" };
}

export async function fetchSocialProfile(provider: SocialProvider, token: SocialToken): Promise<SocialProfile> {
  const response = await fetch(PROVIDERS[provider].profileUrl, {
    headers: { Authorization: `Bearer ${token.accessToken}` },
    signal: AbortSignal.timeout(15_000)
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(`${provider} profile request failed.`);
  if (provider === "kakao") {
    const account = isRecord(body.kakao_account) ? body.kakao_account : {};
    const profile = isRecord(account.profile) ? account.profile : {};
    return normalizeSocialProfile({
      subject: String(body.id || ""),
      email: typeof account.email === "string" ? account.email : null,
      name: typeof profile.nickname === "string" ? profile.nickname : null,
      emailVerified: account.is_email_valid === true && account.is_email_verified === true
    });
  }
  const responseBody = isRecord(body.response) ? body.response : {};
  return normalizeSocialProfile({
    subject: String(responseBody.id || ""),
    email: typeof responseBody.email === "string" ? responseBody.email : null,
    name: typeof responseBody.name === "string" ? responseBody.name : typeof responseBody.nickname === "string" ? responseBody.nickname : null,
    emailVerified: true
  });
}

export function normalizeSocialProfile(input: {
  subject: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
}): SocialProfile {
  const subject = input.subject.trim();
  const email = input.email ? normalizeEmail(input.email) : "";
  if (!subject) throw new Error("Social profile subject is missing.");
  if (!email || !email.includes("@") || !input.emailVerified) {
    throw new Error("Social login requires verified email consent.");
  }
  return { subject, email, name: input.name?.trim() || null, emailVerified: true };
}

function getProviderConfig(provider: SocialProvider) {
  const definition = PROVIDERS[provider];
  return {
    clientId: requireServerEnv(definition.clientIdEnv),
    clientSecret: requireServerEnv(definition.clientSecretEnv),
    redirectUri: requireHttpsCallback(requireServerEnv(definition.redirectUriEnv), provider)
  };
}

function requireServerEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function requireHttpsCallback(value: string, provider: SocialProvider) {
  const url = new URL(value);
  const expectedPath = `/api/auth/oauth/${provider}/callback`;
  if ((process.env.NODE_ENV === "production" && url.protocol !== "https:") || url.pathname !== expectedPath) {
    throw new Error(`${provider} redirect URI is invalid.`);
  }
  return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

