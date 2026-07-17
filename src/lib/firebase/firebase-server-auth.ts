import { AIProviderError } from "@/src/lib/ai/errors";

export type VerifiedFirebaseUser = {
  uid: string;
  email: string;
  name: string | null;
  providerUserInfo: Array<{ providerId?: string }>;
};

type FirebaseLookupResponse = {
  users?: Array<{
    localId?: string;
    email?: string;
    displayName?: string;
    providerUserInfo?: Array<{ providerId?: string }>;
  }>;
  error?: {
    message?: string;
  };
};

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  const token = idToken.trim();
  if (!token) throw new Error("Firebase ID token is missing.");

  const apiKey =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() ||
    process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!apiKey) throw new Error("Firebase web API key is not configured.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token })
    }
  );
  const data = (await response.json().catch(() => ({}))) as FirebaseLookupResponse;

  if (response.status >= 500) {
    throw new Error("Firebase authentication service unavailable.");
  }

  if (!response.ok || !data.users?.[0]?.localId || !data.users[0].email) {
    throw new AIProviderError({
      code: "UNAUTHORIZED",
      message: "Firebase authentication failed.",
      retryable: false,
      status: 401
    });
  }

  const user = data.users[0];
  return {
    uid: user.localId || "",
    email: user.email || "",
    name: user.displayName || null,
    providerUserInfo: user.providerUserInfo || []
  };
}

export async function verifyRecentFirebaseAuthentication(idToken: string, expectedUid: string, maxAgeSeconds = 300) {
  const user = await verifyFirebaseIdToken(idToken);
  if (user.uid !== expectedUid) throw new Error("Recent authentication belongs to another account.");
  const payloadSegment = idToken.split(".")[1];
  if (!payloadSegment) throw new Error("Firebase authentication token is malformed.");
  const payload = JSON.parse(Buffer.from(payloadSegment, "base64url").toString("utf8")) as { auth_time?: unknown };
  const authTime = Number(payload.auth_time);
  const ageSeconds = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isFinite(authTime) || ageSeconds < -30 || ageSeconds > Math.max(30, maxAgeSeconds)) {
    throw new Error("비밀번호를 다시 확인한 뒤 5분 안에 승인해 주세요.");
  }
  return user;
}
