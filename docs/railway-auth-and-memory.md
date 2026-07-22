# Railway Firebase Auth and Permanent Memory Setup

## Persistent storage

For the `DREAMWISH` service, create a Railway Volume named `dreamwish-data`, mount it at `/data`, and set `DATA_DIR=/data`. Chat, OAuth, Gmail sync, and memory JSON files otherwise live in the deployment filesystem and can be lost during redeploys.

Create a private production Railway Storage Bucket named `dreamwish-files`. Connect the Bucket-provided values to the service as Railway reference variables:

- `STORAGE_BUCKET_NAME` from the Bucket name
- `STORAGE_BUCKET_ACCESS_KEY_ID` from `ACCESS_KEY_ID`
- `STORAGE_BUCKET_SECRET_ACCESS_KEY` from `SECRET_ACCESS_KEY`
- `STORAGE_BUCKET_REGION` from `REGION`
- `STORAGE_BUCKET_ENDPOINT` from `ENDPOINT`

Bucket credentials are server-only. Never paste any Bucket value into a `NEXT_PUBLIC_*` variable. Production intentionally fails with `STORAGE_BACKEND_UNAVAILABLE` when this configuration is incomplete; it does not fall back to the deployment filesystem.

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

Provider API keys remain server-only. AI Chat fetches a public catalog containing only provider names, model names, and configured status. It never returns credentials. Configure one or more of Claude, Gemini, OpenRouter, Groq, or Cloudflare AI using `.env.example`.

## Retention

Deleting a conversation from the visible chat list archives it. Source messages and the memories and knowledge graph derived from them remain on the Railway volume.
