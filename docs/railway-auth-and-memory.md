# Railway Firebase Auth and Permanent Memory Setup

## Persistent storage

Mount a Railway volume at `/data` and set `DATA_DIR=/data`. Chat and memory JSON files otherwise live in the deployment filesystem and can be lost during redeploys.

## Firebase Authentication

Set all of these Railway variables from Firebase Console > Project settings > Your apps > Web app:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_WEB_API_KEY` (same Web API key, server-only verification fallback)

In Firebase Console > Authentication > Sign-in method, enable **Email/Password** and **Google**. In Authentication > Settings > Authorized domains, add the Railway-generated hostname and the production hostname `dreamwish.co.kr`.

Redeploy after changing any `NEXT_PUBLIC_*` variable because Next.js embeds public Firebase configuration during the build.

The app supports email/password sign-up and sign-in, Google popup sign-in, password-reset email, and password change for signed-in password users. Firebase can require a recent sign-in before a sensitive password change; if so, sign out and sign back in before retrying.

## AI providers

Provider API keys remain server-only. AI Chat fetches a public catalog containing only provider names, model names, and configured status. It never returns credentials. Configure one or more of Gemini, OpenRouter, Groq, Hugging Face, or Cloudflare AI using `.env.example`.

## Retention

Deleting a conversation from the visible chat list archives it. Source messages and the memories and knowledge graph derived from them remain on the Railway volume.
