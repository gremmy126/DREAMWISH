export type FirebaseAuthClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

export function getFirebaseAuthClientConfig(): FirebaseAuthClientConfig | null {
  // These must remain direct references so Next.js can inline them in the browser bundle.
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim() || "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim() || "";
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() || undefined,
    messagingSenderId:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim() || undefined
  };
}

export function isFirebaseAuthConfigured() {
  return Boolean(getFirebaseAuthClientConfig());
}
