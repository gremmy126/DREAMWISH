export type FirebaseAuthClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
};

export function getFirebaseAuthClientConfig(): FirebaseAuthClientConfig | null {
  const apiKey = env("NEXT_PUBLIC_FIREBASE_API_KEY");
  const authDomain = env("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN");
  const projectId = env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const appId = env("NEXT_PUBLIC_FIREBASE_APP_ID");
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    appId,
    storageBucket: optionalEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: optionalEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID")
  };
}

export function isFirebaseAuthConfigured() {
  return Boolean(getFirebaseAuthClientConfig());
}

function env(key: string) {
  return process.env[key]?.trim() || "";
}

function optionalEnv(key: string) {
  return process.env[key]?.trim() || undefined;
}
