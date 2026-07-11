# Firebase authentication setup

DREAMWISH uses Firebase Authentication in the browser and exchanges the Firebase ID token at `/api/auth/login` for an application session cookie. Email addresses or local storage values sent by the browser never establish server identity.

## Required environment variables

Set the following browser-safe Firebase values in local development and Railway:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN
```

Set this server-only value to at least 32 random bytes:

```text
AUTH_SESSION_SECRET
```

Generate independent values for local and production environments. For example, run `openssl rand -hex 32` and paste the result into `.env.local` or the Railway variable editor. Never prefix this variable with `NEXT_PUBLIC_`, commit it, or reuse the development value in production.

Restart the Next.js server after changing any environment variable. Railway must redeploy after a variable is added or changed.

## Firebase Console

Open Firebase Console, select the project matching `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, and go to Authentication.

1. Under **Sign-in method**, enable **Email/Password**.
2. Enable **Google**, choose a support email, and save.
3. Enable **GitHub** only after configuring its OAuth app as described below.
4. Under **Settings > Authorized domains**, include:
   - `localhost` for local development.
   - `dreamwish.co.kr` for production.
   - `www.dreamwish.co.kr` only if the application is actually served from that host.

Do not add URL schemes or paths to Authorized domains. Production must never use a localhost redirect.

## Google login

Firebase's Google provider uses the web app configuration above. Confirm that the Google provider is enabled and that every host where sign-in is started appears in Firebase Authorized domains. If the generated Google Cloud OAuth client has been manually restricted, its authorized JavaScript origins must include the production origin `https://dreamwish.co.kr` and the local origin in use, such as `http://localhost:3100`.

## GitHub login

Create or edit a GitHub OAuth App and copy its Client ID and Client Secret into the GitHub provider page in Firebase Authentication. Do not place the Client Secret in browser code or a `NEXT_PUBLIC_` variable.

Set the GitHub OAuth App fields as follows:

- **Homepage URL:** `https://dreamwish.co.kr`
- **Authorization callback URL:** use the exact callback shown by Firebase, normally `https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler`

The Authorization callback URL is a Firebase handler. It is not `/api/integrations/github/callback`, which belongs to the separate integration connector flow. After saving the provider in Firebase, set `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN=true` in Railway and redeploy.

GitHub users with private email addresses are accepted only when Firebase returns a verified email for the account. If Firebase reports that the email already belongs to another provider, sign in with the existing provider first rather than creating a duplicate account.

## Railway checklist

Configure the following on the Next.js web service:

- All `NEXT_PUBLIC_FIREBASE_*` variables from the Firebase web app.
- `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN=true` after GitHub is enabled.
- A production-only `AUTH_SESSION_SECRET` containing at least 32 random bytes.
- `APP_URL=https://dreamwish.co.kr` and `NEXT_PUBLIC_APP_URL=https://dreamwish.co.kr`.

After deployment, verify Email/Password registration, Email/Password login, Google login, GitHub login, password-reset email, logout, and password change for a password-based account. OAuth-only accounts intentionally do not show the authenticated password-change action.
