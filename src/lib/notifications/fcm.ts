import { createSign } from "node:crypto";

type FirebaseServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
  token_uri?: string;
};

type AccessToken = { value: string; expiresAt: number };
let cachedAccessToken: AccessToken | null = null;

export type SafeMobilePush = {
  type: string;
  candidateId: string;
  route: string;
};

export async function sendFcmDataMessage(token: string, data: SafeMobilePush) {
  const account = readServiceAccount();
  const accessToken = await getAccessToken(account);
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token,
        data,
        notification: {
          title: "DREAMWISH",
          body: "확인이 필요한 새 매출 후보가 있습니다."
        },
        android: { priority: "high" },
        apns: {
          headers: { "apns-priority": "10" },
          payload: { aps: { "content-available": 1 } }
        }
      }
    })
  });
  const body = await response.json().catch(() => ({})) as { name?: string; error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } };
  if (!response.ok) {
    const error = Object.assign(new Error(body.error?.message || `FCM returned HTTP ${response.status}.`), {
      code: body.error?.status || "FCM_SEND_FAILED",
      fcmErrorCode: body.error?.details?.find((detail) => detail.errorCode)?.errorCode,
      status: response.status
    });
    throw error;
  }
  return body.name || `fcm:${Date.now()}`;
}

async function getAccessToken(account: FirebaseServiceAccount) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  const now = Math.floor(Date.now() / 1_000);
  const assertion = signJwt(account, {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3_600
  });
  const response = await fetch(account.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const body = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw Object.assign(new Error(body.error_description || "Firebase access token issuance failed."), { code: "FCM_AUTH_FAILED" });
  }
  cachedAccessToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 3_600) * 1_000
  };
  return cachedAccessToken.value;
}

function readServiceAccount(): FirebaseServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    const client_email = process.env.FIREBASE_CLIENT_EMAIL?.trim();
    const private_key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/gu, "\n").trim();
    const project_id = process.env.FIREBASE_PROJECT_ID?.trim();
    if (client_email && private_key && project_id) return { client_email, private_key, project_id };
    throw Object.assign(new Error("Firebase service account credentials are not configured."), { code: "FCM_UNCONFIGURED" });
  }
  try {
    const parsed = JSON.parse(raw) as Partial<FirebaseServiceAccount>;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) throw new Error("required fields are missing");
    return parsed as FirebaseServiceAccount;
  } catch {
    throw Object.assign(new Error("FIREBASE_SERVICE_ACCOUNT_JSON is invalid."), { code: "FCM_CONFIG_INVALID" });
  }
}

export function isFcmConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) || Boolean(
    process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim() && process.env.FIREBASE_PROJECT_ID?.trim()
  );
}

function signJwt(account: FirebaseServiceAccount, payload: Record<string, string | number>) {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const body = encodeJson(payload);
  const unsigned = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(account.private_key).toString("base64url")}`;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function resetFcmTokenCacheForTests() {
  cachedAccessToken = null;
}
