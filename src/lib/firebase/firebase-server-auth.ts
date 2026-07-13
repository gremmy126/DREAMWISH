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
