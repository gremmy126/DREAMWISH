# Firebase Authentication Recovery Design

## Goal

Restore production-ready email/password sign-in, account creation, Google sign-in, GitHub sign-in, password reset, and authenticated password change without replacing the existing Firebase-to-server session architecture.

## Root causes and scope

- Every Firebase sign-in path exchanges an ID token for the same signed server session. `AUTH_SESSION_SECRET` is currently absent from the local environment and `.env.example`, so the common exchange can fail after Firebase authentication succeeds.
- GitHub button visibility is controlled by a public flag that is not validated consistently with the existing provider helper. Provider readiness must be expressed with browser-safe configuration only; GitHub client secrets remain server/Firebase Console configuration.
- Authenticated password change calls `updatePassword` without recent credential reauthentication and is also shown to OAuth-only accounts.
- Raw Firebase errors are displayed directly. They need stable, safe user-facing messages while preserving actionable distinctions such as invalid credentials, popup cancellation, provider collision, and recent-login requirements.

This change is limited to authentication, its configuration documentation, and regression tests. It will preserve the current account repository, payment gate, signed session cookie, and unrelated working-tree changes.

## Architecture and data flow

Email sign-in, account creation, Google popup sign-in, and GitHub popup sign-in continue through the Firebase browser SDK. After success, the client obtains a Firebase ID token and posts only that token to `/api/auth/login`. The server verifies the canonical Firebase UID and email, upserts the existing account record, signs the application session, and writes the existing `HttpOnly`, `SameSite=Lax`, production-`Secure` cookie.

Session restoration continues to require a current Firebase user and a newly obtained ID token. Local storage remains a UI cache only and cannot establish identity. Logout clears both Firebase state and the server cookie.

`AUTH_SESSION_SECRET` is documented as a mandatory server-only value of at least 32 bytes. Local development receives a generated secret in the ignored `.env.local`; deployed environments must receive an independently generated secret through Railway variables.

## User interface and password behavior

The existing login shell keeps one mutually exclusive sign-in/sign-up mode. Sign-up requires a valid email, a password of at least six characters, and optional display name. Buttons remain disabled while an operation is running to prevent duplicate requests.

Forgot-password sends Firebase's password-reset email for the entered email. Authenticated password change becomes an explicit form or dialog with current password, new password, and confirmation. It reauthenticates an email/password user with `EmailAuthProvider.credential` and `reauthenticateWithCredential` before calling `updatePassword`. OAuth-only users do not receive a misleading password-change action; they are directed to their provider or the reset flow if they want to establish an email password.

Google and GitHub use Firebase providers and popup authentication. Popup cancellation, popup blocking, unauthorized domain, disabled provider, missing email, and account-provider collision receive distinct safe messages. A provider collision tells the user to sign in with the already linked method; access tokens and client secrets are never persisted in the browser.

## Configuration boundaries

Browser configuration is limited to `NEXT_PUBLIC_FIREBASE_*` plus the public GitHub enable flag. `AUTH_SESSION_SECRET`, GitHub client secret, and other OAuth secrets remain server-only. `.env.example` documents names and generation guidance without real secrets.

The implementation can verify local configuration shape but cannot change external consoles. Documentation will list the required Firebase Authorized Domains (`localhost`, `dreamwish.co.kr`, and `www.dreamwish.co.kr` only if used), enabled Email/Password, Google, and GitHub providers, and the Firebase-provided GitHub callback URL. Railway must set the same Firebase public values plus `AUTH_SESSION_SECRET`; production must not redirect to localhost.

## Error handling and testing

A small Firebase error mapper converts known Firebase error codes into stable Korean messages and returns a generic safe fallback for unknown failures. Server session errors distinguish missing/invalid tokens from server configuration failure without exposing secrets.

Tests are written before implementation and cover:

- required session-secret configuration and hardened cookie creation;
- email sign-in and account-creation wiring;
- Google and GitHub provider flows and duplicate-submit guards;
- Firebase error-code mapping for invalid credentials, popup cancellation/blocking, provider collision, and recent-login requirements;
- password reset;
- password-provider detection, reauthentication, matching-password validation, and successful password update;
- OAuth-only password-action suppression;
- logout clearing both Firebase and server sessions.

Completion requires the focused tests, full test suite, TypeScript typecheck, lint, and a production build to pass.
