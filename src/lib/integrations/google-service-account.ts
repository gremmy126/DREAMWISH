import { sign } from "node:crypto";

export type GoogleServiceAccount = {
  type: "service_account";
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: "https://oauth2.googleapis.com/token";
};

export class GoogleServiceAccountError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "GoogleServiceAccountError";
  }
}

export function parseGoogleServiceAccountJson(value: string): GoogleServiceAccount {
  if (!value.trim() || value.length > 32_000) throw new GoogleServiceAccountError("서비스 계정 JSON을 확인하세요.");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(value) as Record<string, unknown>;
  } catch {
    throw new GoogleServiceAccountError("서비스 계정 JSON 형식이 올바르지 않습니다.");
  }
  const type = String(parsed.type || "");
  const projectId = String(parsed.project_id || "").trim();
  const clientEmail = String(parsed.client_email || "").trim();
  const privateKey = String(parsed.private_key || "").replace(/\\n/gu, "\n").trim();
  const tokenUri = String(parsed.token_uri || "").trim();
  if (type !== "service_account" || !projectId || !clientEmail.endsWith(".iam.gserviceaccount.com") || !privateKey.includes("PRIVATE KEY")) {
    throw new GoogleServiceAccountError("Google 서비스 계정의 project_id, client_email, private_key를 확인하세요.");
  }
  if (tokenUri !== "https://oauth2.googleapis.com/token") {
    throw new GoogleServiceAccountError("Google 공식 token_uri만 사용할 수 있습니다.");
  }
  return { type: "service_account", projectId, clientEmail, privateKey, tokenUri };
}

export async function exchangeGoogleServiceAccountToken(
  account: GoogleServiceAccount,
  scopes: string[],
  fetcher: typeof fetch = fetch
) {
  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = encodeJson({ alg: "RS256", typ: "JWT" });
  const encodedClaims = encodeJson({
    iss: account.clientEmail,
    scope: scopes.join(" "),
    aud: account.tokenUri,
    iat: now,
    exp: now + 3600
  });
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  let signature: string;
  try {
    signature = sign("RSA-SHA256", Buffer.from(signingInput), account.privateKey).toString("base64url");
  } catch {
    throw new GoogleServiceAccountError("서비스 계정 private_key를 사용할 수 없습니다.");
  }
  const response = await fetcher(account.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${signingInput}.${signature}`
    }),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new GoogleServiceAccountError(data.error_description || "Google 서비스 계정 인증에 실패했습니다.", response.status || 502);
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in || 3600 };
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}
