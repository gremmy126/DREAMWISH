# DREAMWISH authentication setup

DREAMWISH supports Firebase Email/Password plus server-side Kakao and Naver OAuth login. Every successful method is exchanged for the same signed, HttpOnly DREAMWISH session. Browser email values, OAuth access tokens, and local storage never establish server identity.

## Required Railway variables

Keep the Firebase web values public only because the Firebase browser SDK requires them:

```text
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Configure these values as server-only Railway variables. Never add `NEXT_PUBLIC_` to a client secret:

```text
AUTH_SESSION_SECRET
AUTH_OAUTH_STATE_SECRET
KAKAO_CLIENT_ID
KAKAO_CLIENT_SECRET
KAKAO_REDIRECT_URI=https://dreamwish.co.kr/api/auth/oauth/kakao/callback
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
NAVER_REDIRECT_URI=https://dreamwish.co.kr/api/auth/oauth/naver/callback
APP_URL=https://dreamwish.co.kr
NEXT_PUBLIC_APP_URL=https://dreamwish.co.kr
```

`AUTH_SESSION_SECRET` and `AUTH_OAUTH_STATE_SECRET` must each contain at least 32 random characters and must be different values. Generate separate values for local and production environments, for example with `openssl rand -hex 32`. Redeploy Railway after changing any variable.

## Firebase Email/Password

Open Firebase Console for `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.

1. In Authentication > Sign-in method, enable **Email/Password**.
2. Do not enable Google or GitHub for the DREAMWISH login page; those providers are intentionally not exposed.
3. In Authentication > Settings > Authorized domains, add `localhost` for development and `dreamwish.co.kr` for production.
4. Keep password reset email templates and the production action URL configured in Firebase.

Kakao and Naver accounts do not use a Firebase user and therefore do not show the Firebase password-change control.

## Kakao login

In Kakao Developers, create an application and enable Kakao Login.

- Register the web site domain `https://dreamwish.co.kr`.
- Register the Redirect URI exactly as `https://dreamwish.co.kr/api/auth/oauth/kakao/callback`.
- Enable consent for Kakao Account email and profile nickname. The email must be supplied and verified; otherwise DREAMWISH rejects the login instead of creating an ambiguous account.
- Put the REST API key in `KAKAO_CLIENT_ID` and the client secret in `KAKAO_CLIENT_SECRET`.

For local testing, register and use the exact local callback separately, such as `http://localhost:3000/api/auth/oauth/kakao/callback`. Production always requires HTTPS.

## Naver login

In Naver Developers, register a web application using Naver Login.

- Set the service URL to `https://dreamwish.co.kr`.
- Register the Callback URL exactly as `https://dreamwish.co.kr/api/auth/oauth/naver/callback`.
- Request the email and name profile fields. Email is required for DREAMWISH account linking.
- Put the Client ID in `NAVER_CLIENT_ID` and the Client Secret in `NAVER_CLIENT_SECRET`.

If Naver does not return an email because the user denied consent, DREAMWISH displays a safe consent-required message and does not create an account.

## Identity and security behavior

- OAuth state is provider-bound, expires after 10 minutes, is stored durably, and can be consumed only once.
- Provider access tokens are used only for the profile request and are never stored in cookies, URLs, local storage, or account records.
- Social identities merge into an existing account only when the provider returns the same normalized verified email.
- Coupon codes travel through signed server state; raw coupon codes are not retained in OAuth state.
- Suspended, deleted, or session-invalidated accounts cannot restore a session.

## Deployment verification

After deploying, verify Email/Password registration and login, password reset, Kakao login, Naver login, logout, a denied email-consent flow, a tampered/expired state rejection, and coupon entry with each login path. Confirm the callback host and path character-for-character and inspect browser storage to ensure that no provider token or secret is present.
