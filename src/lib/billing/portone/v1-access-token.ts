import { portOneJson } from "./portone-http";

type CachedToken = { accessToken: string; expiresAtMs: number };
let cached: CachedToken | null = null;

export async function getPortOneV1AccessToken(input: { apiKey: string; apiSecret: string }) {
  if (cached && cached.expiresAtMs - 30_000 > Date.now()) return cached.accessToken;
  const payload = await portOneJson<{
    code: number; message?: string;
    response?: { access_token?: string; now?: number; expired_at?: number };
  }>({
    url: "https://api.iamport.kr/users/getToken",
    method: "POST",
    body: { imp_key: input.apiKey, imp_secret: input.apiSecret }
  });
  const token = payload.response?.access_token;
  if (payload.code !== 0 || !token) throw new Error("PortOne V1 authentication failed.");
  const expiresAtSeconds = payload.response?.expired_at || Math.floor(Date.now() / 1000) + 300;
  cached = { accessToken: token, expiresAtMs: expiresAtSeconds * 1000 };
  return token;
}

export function clearPortOneV1TokenCache() {
  cached = null;
}

