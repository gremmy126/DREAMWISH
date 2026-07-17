# Authenticator, Companion, Revenue Sync, and Automation Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Authenticator-compatible MFA, securely pair a standalone Android/iPhone DREAMWISH Companion, ingest reviewed mobile revenue signals, and make queued/failed automations self-diagnosing and recoverable.

**Architecture:** `D:\gremmy` remains the Next.js/PostgreSQL authority for accounts, pairing, revenue, Queue state, and diagnostics. `D:\DREAMWISH-Companion` is a separate bare React Native 0.86.0 repository with shared TypeScript screens and platform-native security/capture modules. TOTP and pairing are independent security flows: TOTP gates account sessions, while pairing registers a device-held P-256 key and every sync request is signed. Railway runs the web service and a separate durable Automation Worker service against the same PostgreSQL database.

**Tech Stack:** Next.js 15.3, React 19, TypeScript 5.7, PostgreSQL via `postgres`, Zod 4, Node `crypto`, `qrcode.react`, bare React Native 0.86.0, Kotlin/Android Keystore/WorkManager, Swift/CryptoKit/Keychain/Share Extension, Railway.

## Global Constraints

- Work on the existing `main` branch in `D:\gremmy`, as explicitly requested. Do not push either repository until all locally available verification passes and the user reviews the report.
- Create `D:\DREAMWISH-Companion` as a separate Git repository with its own `main` branch. Never copy `.env.local`, cookies, OAuth tokens, Firebase tokens, signing keys, provisioning profiles, TOTP secrets, or production payloads into it.
- Preserve the current desktop design system. Add only the Settings, pairing, revenue-review, execution-diagnosis, and administrator-health UI required by the approved design.
- Production authority for TOTP, pairing, paired devices, revenue candidates, and Worker heartbeats is PostgreSQL. JSON fallback is allowed only when `DATABASE_URL` is absent in local development and tests.
- Do not use `src/lib/security/encryption.ts` for new secrets; it is base64 encoding, not encryption. New sensitive fields use AES-256-GCM with separate server-only keys.
- QR values contain only a short-lived public pairing token or `otpauth` enrollment URI. Logs, audit metadata, API errors, analytics, and execution history must mask secrets and raw financial text.
- Use P-256 ECDSA (`ES256`) for device signatures because Android Keystore, Apple Security APIs, Node, and WebCrypto support it consistently. The server stores only SPKI public-key material.
- Android release output is an AAB for Play Console. iOS source and tests are prepared on Windows, but archive, signing, and TestFlight upload must be run on macOS/Xcode and reported as an external verification boundary.
- Run `npm.cmd test` for web RED/GREEN cycles because `scripts/run-tests.mjs` currently loads the complete `tests/*.test.ts` suite. A RED step is successful only when the newly added assertion fails for the expected missing behavior, not because of an unrelated failure.
- After every schema addition, make the `ensure*Schema()` call idempotent and resettable in tests. Every state-changing endpoint must verify the authenticated owner and append a safe audit event.

---

## Task 1: Add secure cryptographic primitives and QR dependency

**Files:**

- Create: `src/lib/security/aes-gcm-field.ts`
- Create: `src/lib/security/keyed-digest.ts`
- Create: `tests/security-cryptography.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`

- [ ] **Step 1: Write failing cryptography contract tests**

  Add tests proving that AES-GCM ciphertext does not contain plaintext, decrypts with the correct purpose/key, rejects altered authentication tags, and cannot be decrypted under a different purpose. Add keyed-digest tests proving deterministic comparison without persisting the original token.

- [ ] **Step 2: Run the suite and confirm the expected RED result**

  Run: `npm.cmd test`

  Expected: FAIL because `@/src/lib/security/aes-gcm-field` and `keyed-digest` do not exist.

- [ ] **Step 3: Implement the minimal security interfaces**

  Implement:

  ```ts
  export type AesGcmField = {
    version: 1;
    algorithm: "aes-256-gcm";
    iv: string;
    ciphertext: string;
    authTag: string;
  };

  export function sealField(input: {
    plaintext: string;
    keyMaterial: string;
    purpose: string;
  }): AesGcmField;

  export function openField(input: {
    field: AesGcmField;
    keyMaterial: string;
    purpose: string;
  }): string;

  export function keyedDigest(value: string, keyMaterial: string, purpose: string): string;
  export function safeDigestEqual(left: string, right: string): boolean;
  ```

  Derive a 32-byte key with HKDF-SHA256 and bind `purpose` as authenticated data. Decode keys from a 64-character hex string or base64; reject keys shorter than 32 bytes in production.

- [ ] **Step 4: Add the shared QR renderer dependency and environment keys**

  Run: `npm.cmd install qrcode.react@4.2.0`

  Add empty server-only `AUTH_TOTP_ENCRYPTION_KEY`, `AUTH_MFA_CHALLENGE_SECRET`, `DEVICE_PAIRING_HASH_SECRET`, and `REVENUE_DATA_ENCRYPTION_KEY` entries to `.env.example`, each documented as an independent 32-byte random value. Do not add `NEXT_PUBLIC_` prefixes.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Expected: all tests pass; TypeScript exits 0.

  Commit: `git add package.json package-lock.json .env.example src/lib/security tests/security-cryptography.test.ts && git commit -m "feat: add authenticated field encryption"`

---

## Task 2: Implement RFC-compatible TOTP and recovery-code domain logic

**Files:**

- Create: `src/lib/auth/totp.ts`
- Create: `src/lib/auth/recovery-code.ts`
- Create: `src/lib/auth/totp.types.ts`
- Create: `tests/auth-totp-domain.test.ts`

- [ ] **Step 1: Add failing RFC and replay tests**

  Cover RFC 6238 SHA-1 vectors, six-digit 30-second codes, `DREAMWISH` issuer URI encoding, ±1 time-step drift, rejection outside the drift window, and rejection when the matched counter is not greater than `lastAcceptedCounter`. Cover ten random recovery codes formatted in readable groups and one-way keyed hashes.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because the TOTP domain modules do not exist.

- [ ] **Step 3: Implement the pure domain API**

  ```ts
  export type TotpVerification =
    | { ok: true; counter: number }
    | { ok: false; reason: "invalid" | "replayed" | "clock_drift" };

  export function generateTotpSecret(bytes?: number): string;
  export function createTotpUri(input: { secret: string; email: string }): string;
  export function generateTotpCode(input: { secret: string; nowMs: number }): string;
  export function verifyTotpCode(input: {
    secret: string;
    code: string;
    nowMs: number;
    lastAcceptedCounter: number | null;
  }): TotpVerification;
  ```

  Use a 160-bit secret, RFC 4648 base32 without padding, issuer `DREAMWISH`, SHA-1, 30-second period, and six digits. Never log the secret or code.

- [ ] **Step 4: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add src/lib/auth/totp.ts src/lib/auth/totp.types.ts src/lib/auth/recovery-code.ts tests/auth-totp-domain.test.ts && git commit -m "feat: add totp and recovery code domain"`

---

## Task 3: Persist TOTP factors, challenges, recovery codes, rate limits, and audit events

**Files:**

- Create: `src/lib/auth/auth-security.schema.ts`
- Create: `src/lib/auth/totp.repository.ts`
- Create: `src/lib/auth/totp.service.ts`
- Create: `src/lib/auth/auth-security-audit.ts`
- Create: `tests/auth-totp-persistence.test.ts`
- Modify: `src/lib/admin/schema.ts`

- [ ] **Step 1: Write failing repository/service tests**

  Cover pending enrollment expiry after ten minutes, encrypted-at-rest secret, five failed attempt lockout, activation, monotonic accepted counter, one-time recovery-code consumption, regeneration invalidating all old codes, owner isolation, and append-only audit records. Assert that repository JSON and API DTO serialization never contains plaintext secret after enrollment confirmation.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL on missing TOTP persistence/service modules.

- [ ] **Step 3: Add idempotent PostgreSQL schema**

  Create tables:

  - `account_totp_factors(id, account_id UNIQUE, secret_encrypted JSONB, status, last_accepted_counter, created_at, verified_at, disabled_at, updated_at)`;
  - `account_totp_challenges(id, account_id, purpose, challenge_hash, failure_count, expires_at, consumed_at, created_at)`;
  - `account_recovery_codes(id, account_id, code_hash, used_at, created_at)`;
  - `auth_security_rate_limits(scope_key, action, window_started_at, attempt_count, blocked_until, updated_at)`;
  - `auth_security_audit_events(id, account_id, actor_account_id, action, safe_metadata, created_at)` with a trigger rejecting UPDATE/DELETE.

  Use checks for allowed states/purposes and indexes on active challenges and unused recovery codes. Register `ensureAuthSecuritySchema()` from `ensureAdminSchema()` so authentication routes initialize it on production requests.

- [ ] **Step 4: Implement repository and service behavior**

  `beginTotpEnrollment(account)` returns `{ enrollmentId, otpauthUri, manualKey, expiresAt }` once. Persist the secret sealed with `AUTH_TOTP_ENCRYPTION_KEY`. `confirmTotpEnrollment` atomically checks expiry/attempt count/code/replay, activates the factor, and returns recovery-code plaintext exactly once. Rate-limit enrollment, verification, regeneration, disable, and login verification by account and network key using durable challenge counters.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add src/lib/auth src/lib/admin/schema.ts tests/auth-totp-persistence.test.ts && git commit -m "feat: persist authenticator factors securely"`

---

## Task 4: Gate password, Kakao, and Naver sessions behind MFA

**Files:**

- Create: `src/lib/auth/mfa-challenge-token.ts`
- Create: `src/lib/auth/session-issuance.service.ts`
- Create: `app/api/auth/mfa/verify/route.ts`
- Create: `tests/auth-mfa-session-gating.test.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/session/route.ts`
- Modify: `app/api/auth/oauth/[provider]/callback/route.ts`
- Modify: `app/api/auth/logout/route.ts`
- Modify: `src/lib/auth/api-access-policy.ts`

- [ ] **Step 1: Write failing end-to-end route tests**

  Prove that a user without TOTP receives the normal `dreamwish-session`, while a TOTP-enabled password/Kakao/Naver user receives only an HttpOnly five-minute `dreamwish-mfa-challenge` cookie and `{ mfaRequired: true }`. Prove that valid TOTP or unused recovery code consumes the challenge and issues the full session, and that expired/replayed/cross-account challenges fail closed.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because existing primary authentication issues the full session immediately.

- [ ] **Step 3: Centralize session issuance**

  Move the common entitlement/access/session logic into `completePrimaryAuthentication()`. When `getActiveTotpFactor(accountId)` is present, create a random challenge nonce, persist only its keyed digest, sign a purpose-limited token with `AUTH_MFA_CHALLENGE_SECRET`, set `dreamwish-mfa-challenge`, and do not set `dreamwish-session`.

- [ ] **Step 4: Implement final MFA verification**

  `POST /api/auth/mfa/verify` accepts `{ code, method: "totp" | "recovery" }`, reads the challenge cookie, atomically verifies/consumes it, updates replay state or recovery-code use, issues the normal session, clears the challenge cookie, and appends a safe audit event. Logout clears both cookies.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add app/api/auth src/lib/auth tests/auth-mfa-session-gating.test.ts && git commit -m "feat: require authenticator verification at sign in"`

---

## Task 5: Add Authenticator Settings and sign-in challenge UI

**Files:**

- Create: `app/api/auth/totp/status/route.ts`
- Create: `app/api/auth/totp/enroll/route.ts`
- Create: `app/api/auth/totp/verify-enrollment/route.ts`
- Create: `app/api/auth/totp/recovery-codes/route.ts`
- Create: `app/api/auth/totp/disable/route.ts`
- Create: `components/Settings/AuthenticatorSettingsCard.tsx`
- Create: `components/auth/MfaChallengeDialog.tsx`
- Create: `tests/authenticator-ui-contract.test.ts`
- Modify: `components/Settings/SettingsView.tsx`
- Modify: `components/auth/AuthGate.tsx`
- Modify: `components/auth/LoginDialog.tsx`

- [ ] **Step 1: Write failing API/UI contract tests**

  Assert the enrollment QR uses the returned `otpauthUri`, the manual key is copyable but never stored in localStorage, recovery codes are shown only in the one-time confirmation state, and the login dialog can switch between six-digit code and recovery code. Assert Korean error text for invalid, expired, replayed, rate-limited, and clock-drift cases.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because the routes and components are missing.

- [ ] **Step 3: Implement owner-scoped TOTP routes**

  Require a signed-in owner for all Settings endpoints. Enrollment and confirmation use the service from Task 3. Recovery-code regeneration and disable require both a current TOTP code and a session issued within the last five minutes; otherwise return `PRIMARY_REAUTH_REQUIRED` and instruct the user to sign in again.

- [ ] **Step 4: Implement Settings UI**

  Add `Settings → Security → Authenticator` with states `disabled`, `pending`, and `active`. Render `QRCodeSVG` at a readable size, manual-key copy button, six-digit input, one-time recovery-code acknowledgement, regenerate, and disable controls. Use 44px minimum targets, focus management, and screen-reader status text.

- [ ] **Step 5: Implement login MFA UI**

  Update `AuthGate.completeFirebaseLogin` and OAuth-return handling so `{ mfaRequired: true }` opens `MfaChallengeDialog` instead of authenticating the client. On success, call `/api/auth/me`, apply access, and close both dialogs. Do not put the MFA token or code in the URL or client persistence.

- [ ] **Step 6: Verify and commit**

  Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Commit: `git add app/api/auth/totp components/Settings components/auth tests/authenticator-ui-contract.test.ts && git commit -m "feat: add authenticator enrollment and challenge UI"`

---

## Task 6: Replace secret-based phone pairing with PostgreSQL public-key pairing

**Files:**

- Create: `src/lib/devices/device.schema.ts`
- Create: `src/lib/devices/pairing.repository.ts`
- Create: `src/lib/devices/pairing.service.ts`
- Create: `src/lib/devices/device-contract.ts`
- Create: `src/lib/devices/device-signature.ts`
- Create: `src/lib/devices/signed-envelope.ts`
- Create: `public/contracts/companion-v1.schema.json`
- Create: `app/api/devices/pairing-challenges/[sessionId]/register/route.ts`
- Create: `app/api/devices/pairing-challenges/[sessionId]/confirm/route.ts`
- Create: `app/api/devices/pairing-challenges/[sessionId]/status/route.ts`
- Modify: `src/lib/devices/device.types.ts`
- Modify: `src/lib/devices/device.repository.ts`
- Modify: `app/api/devices/pairing-challenges/route.ts`
- Modify: `app/api/devices/pair/route.ts`
- Modify: `app/api/devices/[deviceId]/sync/route.ts`
- Modify: `tests/device-pairing.test.ts`

- [ ] **Step 1: Extend pairing tests to the approved protocol**

  Add RED tests for owner/platform binding, ten-minute expiry, five wrong-code attempts, one-time confirmation, cross-owner rejection, token-hash storage, P-256 SPKI validation, valid signature acceptance, tampered-payload rejection, sequence replay, duplicate event ID, stale timestamps, paused/revoked device rejection, and restart-safe repository reconstruction.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because current pairing uses a shared device secret and JSON-only challenges.

- [ ] **Step 3: Add the pairing/device schema**

  Create `device_pairing_sessions` and `paired_devices` with the approved fields, unique active token hash, state checks, public-key algorithm restricted to `ES256`, monotonic sequence, and owner/device indexes. Add `device_sync_events` with `(device_id, event_id)` uniqueness for idempotency and append-only `device_audit_events`.

- [ ] **Step 4: Implement the versioned pairing contract**

  Use these DTOs:

  ```ts
  type CreatePairingResponse = {
    apiVersion: 1;
    sessionId: string;
    pairingUrl: string;
    fallbackUrl: string;
    expiresAt: string;
  };

  type RegisterDeviceRequest = {
    publicToken: string;
    platform: "android" | "ios";
    keyAlgorithm: "ES256";
    publicKeySpki: string;
    appVersion: string;
  };
  ```

  The unauthenticated register/status calls must present the high-entropy public token in an Authorization header; never persist it in plaintext. Registration returns the six-digit confirmation code only to the Companion. Authenticated web confirmation accepts only the code and the owner-bound session ID.

  Publish the request/response/envelope contract as `public/contracts/companion-v1.schema.json`. Derive the server Zod schemas and TypeScript DTOs from the same field constants in `device-contract.ts`; the Companion validates downloaded/cached contract version `1` and refuses a higher unsupported major version.

- [ ] **Step 5: Verify signed sync envelopes**

  Canonicalize the envelope with recursively sorted JSON keys and no `signature` field. Verify P-256/SHA-256, ±5-minute send time, payload version/size, event uniqueness, and sequence in one DB transaction before dispatching the typed payload. Return stable masked errors.

- [ ] **Step 6: Deprecate the shared-secret endpoint safely**

  Make `POST /api/devices/pair` return HTTP 410 with `DEVICE_PAIRING_PROTOCOL_UPGRADE_REQUIRED`; do not silently accept the legacy secret flow after the new Companion is wired.

- [ ] **Step 7: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add src/lib/devices app/api/devices tests/device-pairing.test.ts && git commit -m "feat: secure phone pairing with device public keys"`

---

## Task 7: Add web QR pairing UX and verified App/Universal Links

**Files:**

- Create: `app/.well-known/assetlinks.json/route.ts`
- Create: `app/.well-known/apple-app-site-association/route.ts`
- Create: `src/lib/devices/app-link-config.ts`
- Create: `tests/device-pairing-ui.test.ts`
- Modify: `components/Business/DeviceConnectionPanel.tsx`
- Modify: `.env.example`

- [ ] **Step 1: Write failing UI and link-association tests**

  Assert normal-camera instructions, HTTPS QR value, explicit Android/iPhone wording, phone-shown code input, expiry countdown, polling stop on active/expired, focus return, and the fact that iPhone does not claim automatic bank-notification reading. Validate Android package/fingerprint and Apple team/bundle identifiers in the association responses.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because the current UI displays a website-generated six-digit code and has no QR/App Link metadata.

- [ ] **Step 3: Implement the QR pairing state machine**

  `DeviceConnectionPanel` creates a pairing session, renders `QRCodeSVG(value=pairingUrl)`, displays expiry, accepts the phone's code, submits confirmation, and polls status with cancellation on unmount. States are `idle → creating → awaiting_phone → awaiting_web_code → active|expired|error`. Preserve existing Business page styling.

- [ ] **Step 4: Implement association endpoints**

  Serve JSON with correct content types and no redirect. Use `ANDROID_APP_PACKAGE=kr.co.dreamwish.companion`, `ANDROID_APP_SHA256_CERT_FINGERPRINT`, `APPLE_TEAM_ID`, and `APPLE_BUNDLE_ID=kr.co.dreamwish.companion` from server environment. Add these names to `.env.example` without real fingerprints or team IDs.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Commit: `git add app/.well-known components/Business/DeviceConnectionPanel.tsx src/lib/devices/app-link-config.ts .env.example tests/device-pairing-ui.test.ts && git commit -m "feat: add camera-based companion pairing"`

---

## Task 8: Scaffold the standalone bare React Native Companion repository

**Files:**

- Create repository: `D:\DREAMWISH-Companion`
- Create: `D:\DREAMWISH-Companion\src\api\companion-api.ts`
- Create: `D:\DREAMWISH-Companion\src\contracts\device-contract.ts`
- Create: `D:\DREAMWISH-Companion\src\navigation\AppNavigator.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\WelcomeScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\PairingScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\ConnectionScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\PermissionsScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\PrivacyScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\storage\offline-queue.ts`
- Create: `D:\DREAMWISH-Companion\src\__tests__\device-contract.test.ts`
- Create: `D:\DREAMWISH-Companion\.env.example`
- Modify: `D:\DREAMWISH-Companion\App.tsx`
- Modify: `D:\DREAMWISH-Companion\package.json`

- [ ] **Step 1: Create and initialize the separate repository**

  From `D:\` run:

  `npx.cmd @react-native-community/cli@latest init DREAMWISHCompanion --version 0.86.0 --directory D:\DREAMWISH-Companion`

  Then from `D:\DREAMWISH-Companion` run `git init -b main`. Confirm `package.json` pins `react-native` to `0.86.0` and Node engine 22 or newer. Do not use Expo.

- [ ] **Step 2: Add dependencies with locked versions**

  Run:

  `npm.cmd install --save-exact @react-navigation/native@7.1.17 @react-navigation/native-stack@7.3.26 react-native-safe-area-context@5.6.1 react-native-screens@4.16.0 @react-native-async-storage/async-storage@2.2.0 zod@4.4.3`

  Commit the generated lockfile. Store only non-secret UI preferences in AsyncStorage.

- [ ] **Step 3: Write failing shared-contract tests**

  Cover HTTPS `https://dreamwish.co.kr/pair?...` and `dreamwish://pair?...` parsing, rejection of unknown hosts/schemes, DTO validation, canonical signed-envelope fields, monotonic queue ordering, and idempotent acknowledgement removal.

  Run: `npm.cmd test -- --runInBand`

  Expected: FAIL because the shared contract/API/queue modules do not exist.

- [ ] **Step 4: Implement shared screens and versioned API client**

  The client base URL comes from build-time `DREAMWISH_API_BASE_URL` and defaults only in debug to `http://10.0.2.2:3100`. Production accepts HTTPS `dreamwish.co.kr` only. Implement pairing registration/status, signed sync upload, exponential retry metadata, pause/disconnect, last sync, and pending count. Never accept account passwords, Firebase tokens, integration OAuth tokens, or TOTP secrets.

- [ ] **Step 5: Verify and commit in the Companion repository**

  Run: `npm.cmd test -- --runInBand && npm.cmd run lint && npx.cmd tsc --noEmit`

  Commit: `git add . && git commit -m "feat: scaffold dreamwish companion"`

---

## Task 9: Implement Android secure pairing, notification capture, and offline sync

**Files:**

- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\security\DeviceKeyStore.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\pairing\PairingModule.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\notifications\FinancialNotificationListener.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\notifications\NotificationSanitizer.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\sync\EncryptedEventStore.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\sync\RevenueSyncWorker.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\test\java\kr\co\dreamwish\companion\NotificationSanitizerTest.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\androidTest\java\kr\co\dreamwish\companion\PairingAndQueueTest.kt`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\AndroidManifest.xml`
- Modify: `D:\DREAMWISH-Companion\android\app\build.gradle`
- Modify: `D:\DREAMWISH-Companion\android\build.gradle`

- [ ] **Step 1: Add failing Android unit tests**

  Cover selected-package allowlisting, discard outside allowlist, account/card redaction, amount/direction/cancellation parsing, deterministic transaction fingerprint, and no raw notification persistence.

  Run: `D:\DREAMWISH-Companion\android\gradlew.bat testDebugUnitTest`

  Expected: FAIL on missing Android modules.

- [ ] **Step 2: Implement non-exportable key and pairing bridge**

  Set Gradle `namespace` and `applicationId` to `kr.co.dreamwish.companion`. Generate P-256 in Android Keystore with signing purpose, SHA-256 digest, user-unlocked-device requirement, and StrongBox when available with a supported fallback. Export only SPKI public key. Register the key through the shared API and sign canonical envelopes with the private-key alias. Delete the alias on disconnect/revocation.

- [ ] **Step 3: Implement App Link handling**

  Add verified HTTPS intent filter for `dreamwish.co.kr/pair` and a non-exported internal handoff. Support `dreamwish://pair` only as an explicit fallback opened from the website. Reject expired/malformed tokens before network calls.

- [ ] **Step 4: Implement explicit notification capture**

  Declare `NotificationListenerService` and show an OS-settings permission explanation. Persist the user's installed-package allowlist locally. On-device processing keeps only package name, redacted title/text-derived fields, captured time, amount, direction, counterparty hint, confidence, fingerprint, and cancellation reference. Discard unrelated content before queue insertion.

- [ ] **Step 5: Implement encrypted offline queue and WorkManager sync**

  Encrypt queued JSON with AES-GCM using a Keystore-wrapped data key. WorkManager uploads signed batches under network constraints, retries transient/network/429 failures with bounded exponential backoff, acknowledges individual event IDs, and leaves permanent rejected events visible for user deletion.

- [ ] **Step 6: Configure Play release without committing secrets**

  Read `DREAMWISH_UPLOAD_STORE_FILE`, `DREAMWISH_UPLOAD_STORE_PASSWORD`, `DREAMWISH_UPLOAD_KEY_ALIAS`, and `DREAMWISH_UPLOAD_KEY_PASSWORD` from Gradle properties/environment. Fail the release build with a clear message if absent; debug builds remain available. Add ProGuard rules preserving React Native bridge classes and no sensitive logging.

- [ ] **Step 7: Verify and commit**

  Run:

  - `D:\DREAMWISH-Companion\android\gradlew.bat testDebugUnitTest`
  - `D:\DREAMWISH-Companion\android\gradlew.bat assembleDebug`

  Expected: unit tests pass and `android\app\build\outputs\apk\debug\app-debug.apk` exists. Instrumentation runs when an emulator/device is available: `gradlew.bat connectedDebugAndroidTest`.

  Commit: `git add android src && git commit -m "feat: add secure android revenue sync"`

---

## Task 10: Implement iPhone pairing, Share Extension, and encrypted retry

**Files:**

- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Security\DeviceKeyStore.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Pairing\PairingBridge.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Sync\EncryptedEventStore.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Permissions\ContactsCalendarBridge.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\ShareViewController.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\ShareSanitizer.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanionTests\PairingAndShareTests.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\DREAMWISHCompanion.entitlements`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\DREAMWISHShareExtension.entitlements`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Info.plist`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion.xcodeproj\project.pbxproj`

- [ ] **Step 1: Add XCTest coverage before implementation**

  Cover Universal Link parsing, malformed-link rejection, P-256 signature verification fixture, redaction, amount/direction/cancellation parsing, encrypted queue round-trip, and Share Extension rejection of empty/oversized input.

- [ ] **Step 2: Implement key and link handling**

  Use `SecKeyCreateRandomKey` with P-256 and Secure Enclave when supported, otherwise Keychain-backed non-synchronizable key material with `ThisDeviceOnly` accessibility. Export only public SPKI, sign SHA-256 digests, and remove key references on disconnect. Add Associated Domains `applinks:dreamwish.co.kr` and `dreamwish://pair` fallback handling.

- [ ] **Step 3: Implement explicit Share Extension capture**

  Accept user-shared text only. Redact and parse inside the extension, then pass only the minimal structured event through the App Group. The main app encrypts pending events with a CryptoKit AES-GCM key stored in Keychain and signs/uploads them. UI copy must state that automatic reading of other apps' notifications is not available on iPhone.

- [ ] **Step 4: Add contacts/calendar permission adapters**

  Use Contacts and EventKit permission prompts only after a user action, with denial/revocation states visible in `PermissionsScreen`. Transmit selected records only through the signed sync contract.

- [ ] **Step 5: Verify source on Windows and record macOS boundary**

  Run shared checks: `npm.cmd test -- --runInBand && npm.cmd run lint && npx.cmd tsc --noEmit`.

  On macOS/Xcode, run: `xcodebuild test -workspace ios/DREAMWISHCompanion.xcworkspace -scheme DREAMWISHCompanion -destination 'platform=iOS Simulator,name=iPhone 16'` and then archive with the private TestFlight signing team. On Windows, mark these two commands as not executed with the explicit reason `requires macOS/Xcode`; do not claim they passed.

- [ ] **Step 6: Commit**

  Commit: `git add ios src && git commit -m "feat: add ios pairing and share capture"`

---

## Task 11: Make mobile revenue persistence durable, deduplicated, and auditable

**Files:**

- Create: `src/lib/business/revenue.schema.ts`
- Create: `src/lib/business/revenue-policy.ts`
- Create: `src/lib/business/revenue-audit.repository.ts`
- Create: `src/lib/business/gmail-revenue-import.service.ts`
- Create: `app/api/business/revenue/trusted-sources/route.ts`
- Modify: `src/lib/business/revenue.types.ts`
- Modify: `src/lib/business/revenue-parser.ts`
- Modify: `src/lib/business/revenue.repository.ts`
- Modify: `src/lib/business/business-overview.ts`
- Modify: `src/lib/billing/billing-event.repository.ts`
- Modify: `app/api/business/revenue/route.ts`
- Modify: `app/api/business/messages/sync/route.ts`
- Modify: `app/api/devices/[deviceId]/sync/route.ts`
- Modify: `tests/mobile-revenue-bridge.test.ts`

- [ ] **Step 1: Extend revenue tests to the approved lifecycle**

  Add RED cases for PostgreSQL restart persistence, encrypted raw text, account/card redaction before upload, unique event ID, transaction fingerprint duplicate, cancellation linking, provisional KPI exclusion, confirmed-income KPI inclusion, correction to expense/personal/rejected/duplicate, owner isolation, trusted Android source auto-confirm only at high confidence, verified Gmail sender import as provisional, untrusted Gmail sender exclusion, and reversal with audit history.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because current candidates are JSON-only and lack cancellation/trust policy.

- [ ] **Step 3: Add revenue schema and repository adapter**

  Create `revenue_candidates`, `revenue_source_trust_rules`, and append-only `revenue_audit_events`. Add owner/device/event/fingerprint indexes, `linked_candidate_id`, `review_state`, `classification`, `confidence`, `raw_encrypted`, and timestamps. Select PostgreSQL in production and keep current owner-scoped JSON store only without `DATABASE_URL`.

- [ ] **Step 4: Implement duplicate, cancellation, and trust policy**

  Build transaction fingerprints from normalized owner, source package, direction, amount, counterparty hint, and bounded captured-time bucket. Link cancellation events to the most recent compatible original. Auto-confirm only `android`, explicitly trusted package, income, confidence ≥0.95, not duplicate/cancellation, and no conflicting match. Every automatic/manual transition appends an actor/reason event.

- [ ] **Step 5: Import only explicitly trusted Gmail transaction alerts**

  Feed Gmail messages into `gmail-revenue-import.service.ts` only after normal Gmail OAuth/scope validation. The user explicitly selects trusted financial senders in the revenue-source policy; matching high-confidence transaction alerts create `captureMethod: "gmail"` provisional candidates and never auto-confirm. Hash Gmail message IDs for idempotency and do not forward message bodies to AI.

- [ ] **Step 5A: Consume verified live PortOne confirmed-payment events**

  Read unconsumed append-only `payment_confirmed` billing events, create confirmed revenue with the provider payment ID as the idempotency key, and atomically record the consumed event ID. Reject any event whose environment is not `live`, even though Billing should never emit Sandbox events. Store provider, amount, currency, paid time, and safe order label only.

  ```ts
  export async function importConfirmedBillingEvent(event: BillingEvent) {
    if (event.type !== "payment_confirmed" || event.environment !== "live") return null;
    return createConfirmedRevenueFromBilling({
      ownerId: event.ownerId,
      eventId: event.providerPaymentId,
      amount: event.amount,
      currency: event.currency,
      occurredAt: event.occurredAt,
      source: event.provider
    });
  }
  ```

- [ ] **Step 6: Verify KPI invariants and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add src/lib/business src/lib/billing/billing-event.repository.ts app/api/business/revenue app/api/business/messages/sync/route.ts app/api/devices tests/mobile-revenue-bridge.test.ts && git commit -m "feat: persist reviewed revenue signals"`

---

## Task 12: Add pending revenue and trusted-source controls to Business

**Files:**

- Create: `components/Business/RevenueReviewPanel.tsx`
- Create: `components/Business/TrustedRevenueSources.tsx`
- Create: `tests/mobile-revenue-ui.test.ts`
- Modify: `components/Business/ErpWorkspace.tsx`
- Modify: `components/Business/BusinessHub.tsx`
- Modify: `app/api/business/overview/route.ts`

- [ ] **Step 1: Write failing UI contract tests**

  Assert a distinct `확인 대기 매출` card, source app, captured time, parsed direction/amount, counterparty hint, confidence, duplicate/cancellation warnings, and actions for confirm revenue/change expense/mark personal/duplicate/reject-correct. Assert pending values never appear inside confirmed KPI totals.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because the Business UI does not expose the complete review/trust contract.

- [ ] **Step 3: Implement the review UI**

  Fetch owner-scoped candidates, update optimistically only after a successful response, return focus after dialogs, and display Korean-safe retryable errors. Never render raw unredacted notification text. Show an audit summary and reversal for auto-confirmed items.

- [ ] **Step 4: Implement trusted Android-source controls**

  List only currently paired Android packages observed from the user's devices. Require an explicit acknowledgement that only high-confidence income is auto-confirmed. Allow immediate disable. Hide this feature for iPhone sources.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Commit: `git add components/Business app/api/business/overview tests/mobile-revenue-ui.test.ts && git commit -m "feat: add mobile revenue review experience"`

---

## Task 12A: Deliver deduplicated revenue review notifications to paired phones

**Files:**

- Create: `src/lib/devices/push-token.repository.ts`
- Create: `src/lib/notifications/firebase-cloud-messaging.adapter.ts`
- Create: `src/lib/business/revenue-notification.service.ts`
- Create: `app/api/devices/push-token/route.ts`
- Create: `tests/mobile-revenue-notifications.test.ts`
- Modify: `src/lib/automation/queue/notification-worker.ts`
- Modify: `src/lib/automation/queue/notification-outbox.ts`
- Modify: `src/lib/automation/runtime/schema.ts`
- Modify: `D:\DREAMWISH-Companion\package.json`
- Modify: `D:\DREAMWISH-Companion\src\services\device-api.ts`
- Create: `D:\DREAMWISH-Companion\src\services\push-notifications.ts`
- Modify: `D:\DREAMWISH-Companion\src\screens\ConnectionStatusScreen.tsx`

- [ ] **Step 1: Write failing device-token and Outbox tests**

  ```ts
  test("a paired device can register only its own push token", async () => {
    await registerPushToken({ ownerId: "owner-1", deviceId: "device-1", token: "token-1", platform: "android" });
    await assert.rejects(
      () => registerPushToken({ ownerId: "owner-2", deviceId: "device-1", token: "token-2", platform: "android" }),
      /device owner/u
    );
  });

  test("one provisional revenue event queues one deduplicated mobile push", async () => {
    await enqueueRevenueReviewNotification(candidate);
    await enqueueRevenueReviewNotification(candidate);
    const rows = await listNotificationOutbox(candidate.ownerId);
    assert.equal(rows.filter((row) => row.channel === "mobile_push").length, 1);
    assert.doesNotMatch(JSON.stringify(rows), /rawNotificationText|accountNumber/u);
  });
  ```

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL on the new push-token and revenue-notification assertions because the repository and FCM Adapter do not exist.

- [ ] **Step 3: Persist owner/device-bound push tokens**

  Add `device_push_tokens` with `device_id`, `owner_id`, `platform`, encrypted token, token digest, status, timestamps, and a unique active token digest. Registration requires the same signed device envelope used by sync; account cookies alone cannot register a token for an arbitrary device. Revocation or device disconnect disables every associated token.

  ```ts
  export type PushTokenRegistration = {
    ownerId: string;
    deviceId: string;
    platform: "android" | "ios";
    token: string;
  };
  ```

- [ ] **Step 4: Implement the FCM notification Adapter and revenue event producer**

  Send through Firebase Cloud Messaging HTTP v1 using the existing server-only Firebase project/client-email/private-key configuration. Obtain short-lived Google OAuth credentials server-side, never expose them, and send only candidate ID, safe title, amount, direction, captured time, and an app deep link. Permanent invalid-token responses disable the token; retryable responses return to the existing leased Outbox.

  ```ts
  export const firebaseMobilePushAdapter: NotificationChannelAdapter = {
    supports(channel) { return channel === "mobile" || channel === "mobile_push"; },
    async send(envelope) {
      const tokens = await listActivePushTokens(envelope.ownerId);
      const receipts = await sendFcmDataMessages(tokens, buildSafeRevenueMessage(envelope));
      return { providerReceiptId: receipts.batchId };
    }
  };
  ```

- [ ] **Step 5: Register tokens and handle notifications in the Companion**

  In `D:\DREAMWISH-Companion`, run `npm.cmd install @react-native-firebase/app @react-native-firebase/messaging`. Initialize the packages from build-time public Firebase project/app identifiers; keep service-account keys server-only. After pairing, request notification permission, obtain the FCM token, register it with a signed device request, refresh it on token rotation, and route `dreamwish://business/revenue/{candidateId}` to the pending-revenue screen. Android and iPhone copy must explain OS notification permission and allow immediate disable.

- [ ] **Step 6: Verify web and mobile builds**

  Run in `D:\gremmy`: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Expected: all web tests pass and duplicate revenue candidates create one safe Push Outbox item.

  Run in `D:\DREAMWISH-Companion`: `npm.cmd test && npx.cmd tsc --noEmit && android\gradlew.bat testDebugUnitTest && android\gradlew.bat assembleDebug`

  Expected: JS/Kotlin tests pass and the Android debug APK builds. iOS source is reviewed on Windows; APNs entitlement and TestFlight delivery remain a macOS/external credential check.

- [ ] **Step 7: Commit web and Companion changes separately**

  In `D:\gremmy`:

  `git add src/lib/devices src/lib/notifications src/lib/business/revenue-notification.service.ts src/lib/automation/queue app/api/devices/push-token/route.ts tests/mobile-revenue-notifications.test.ts && git commit -m "feat: notify paired devices of revenue reviews"`

  In `D:\DREAMWISH-Companion`:

  `git add package.json package-lock.json src && git commit -m "feat: receive revenue review notifications"`

---

## Task 13: Deploy a dedicated Railway Automation Worker with durable heartbeat

**Files:**

- Create: `railway.automation-worker.toml`
- Create: `src/lib/automation/queue/worker-heartbeat.repository.ts`
- Create: `tests/automation-worker-health.test.ts`
- Modify: `src/lib/automation/runtime/schema.ts`
- Modify: `src/lib/automation/queue/worker-entry.ts`
- Modify: `scripts/run-automation-worker.mjs`
- Modify: `app/api/admin/system/status/route.ts`
- Modify: `components/Admin/AdminSystemStatus.tsx`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Add failing Worker-health tests**

  Cover heartbeat registration, update every ten seconds, fresh/stale threshold at thirty seconds, stopped state, process-restart replacement, capabilities/version, and `configured` vs `healthy` admin responses. Assert environment values and Worker IDs are masked for non-admins.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because status currently infers Worker availability from environment variables.

- [ ] **Step 3: Add durable heartbeat schema/repository**

  Create `automation_worker_heartbeats(worker_id PRIMARY KEY, version, capabilities JSONB, started_at, last_seen_at, stopped_at)`, prune/ignore expired rows, and expose `listFreshCompatibleWorkers(capability, now)`. Write heartbeat at startup and every ten seconds; mark stopped on SIGTERM/SIGINT before shutdown when possible.

- [ ] **Step 4: Add the Railway service definition**

  `railway.automation-worker.toml` uses the same build command as web and `startCommand = "npm run automation:worker"`, `restartPolicyType = "ON_FAILURE"`, and ten retries. README gives exact Railway steps: create a second service from the same repository, set its config file path to `/railway.automation-worker.toml`, share `DATABASE_URL`, set the same automation encryption key and required auth secrets, and verify a fresh DB heartbeat. Do not use the web service's `PORT` health check for the Worker.

- [ ] **Step 5: Report real health in administrator UI**

  Show `not configured`, `configured but offline`, or `healthy`, last-seen age, version compatibility, and capabilities. Do not call an environment-only check “healthy.”

- [ ] **Step 6: Verify and commit**

  Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Commit: `git add railway.automation-worker.toml src/lib/automation/queue src/lib/automation/runtime/schema.ts scripts app/api/admin/system/status components/Admin .env.example README.md tests/automation-worker-health.test.ts && git commit -m "feat: add durable automation worker health"`

---

## Task 14: Preflight automation connections before Queue insertion

**Files:**

- Create: `src/lib/automation/runtime/execution-preflight.ts`
- Create: `src/lib/automation/runtime/automation-error-catalog.ts`
- Create: `tests/automation-execution-diagnostics.test.ts`
- Modify: `src/lib/automation/runtime/types.ts`
- Modify: `src/lib/automation/runtime/schema.ts`
- Modify: `src/lib/automation/runtime/execution.repository.ts`
- Modify: `src/lib/automation/runtime/execution-enqueue.service.ts`
- Modify: `src/lib/automation/runtime/workflow-runner.ts`
- Modify: `src/lib/automation/action-credential.service.ts`
- Modify: `app/api/automation/workflows/[workflowId]/execute/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/run/route.ts`

- [ ] **Step 1: Write failing diagnosis/preflight tests**

  Cover all stable codes: `WORKER_OFFLINE`, `CONNECTION_REQUIRED`, `CONNECTION_NOT_FOUND`, `CREDENTIAL_INVALID`, `SCOPE_INSUFFICIENT`, `RATE_LIMITED`, `ADAPTER_UNAVAILABLE`, and `PROVIDER_AUTH_FAILED`. Prove missing/invalid connection creates durable `waiting_connection` and no Queue job, reconnecting the exact node enqueues one new job/event, retry metadata survives restart, and secrets/provider bodies are masked.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because execution is enqueued before every connection/credential/scope check and no shared remediation catalog exists.

- [ ] **Step 3: Extend durable execution retry fields without duplicating existing errors**

  Keep the existing `error_code` and `error_message` columns and treat `error_message` as the server-sanitized message exposed as `safeErrorMessage` in DTOs. Add only `retry_eligible` and `retry_at` to executions and step runs with safe idempotent ALTER statements. Keep API request ID, rate-limit remaining, Adapter latency, and retry count already present. Never persist arbitrary remediation HTML.

- [ ] **Step 4: Implement the preflight service**

  Before Queue insertion, validate graph, pinned ActionDefinition/Adapter version, node required inputs, selected connection ownership, connection existence, credential status/expiry, required scopes, Adapter implementation, and activation mode. Return typed findings with node/step IDs and deep-link descriptors. Structural failures reject the request; correctable connection failures persist `waiting_connection` without a Queue row.

- [ ] **Step 5: Normalize runtime failures**

  Translate credential/adapter/provider exceptions into stable codes at the single common pipeline boundary. Preserve provider request ID and rate-limit timing only in safe typed fields. Permanent configuration failures stop retries; transient rate-limit/provider failures use the existing queue `nextRunAt`/retry count.

- [ ] **Step 6: Verify and commit**

  Run: `npm.cmd test && npm.cmd run typecheck`

  Commit: `git add src/lib/automation app/api/automation tests/automation-execution-diagnostics.test.ts && git commit -m "feat: preflight automation executions"`

---

## Task 15: Diagnose stale queued runs and show actionable recovery in execution history

**Files:**

- Create: `src/lib/automation/runtime/execution-diagnosis.service.ts`
- Create: `components/Automation/ExecutionDiagnosisCard.tsx`
- Create: `tests/automation-diagnostics-ui.test.ts`
- Modify: `app/api/automation/executions/route.ts`
- Modify: `app/api/automation/executions/[executionId]/route.ts`
- Modify: `app/api/automation/runs/[runId]/retry/route.ts`
- Modify: `components/Automation/DurableRunHistory.tsx`
- Modify: `components/Automation/AutomationView.tsx`

- [ ] **Step 1: Write failing API/UI tests**

  Assert a queued run younger than thirty seconds shows queue position/next run without an error; a run older than thirty seconds with no compatible fresh heartbeat derives `WORKER_OFFLINE` while persisted state remains `queued`; healthy Worker suppresses that diagnosis. Assert execution details show error code, failing step, safe cause, recovery steps, exact node deep link, retry eligibility/time, API request ID, rate-limit status, Adapter latency, and connection-repair navigation.

- [ ] **Step 2: Confirm RED**

  Run: `npm.cmd test`

  Expected: FAIL because history currently displays only status and step `errorMessage`.

- [ ] **Step 3: Implement server-owned diagnosis descriptors**

  Return:

  ```ts
  type ExecutionDiagnosis = {
    code: AutomationErrorCode;
    title: string;
    safeReason: string;
    recoverySteps: string[];
    action: { kind: "open_node" | "open_connection" | "retry" | "open_admin_health"; href: string } | null;
    retryEligible: boolean;
    retryAt: string | null;
  };
  ```

  Compute descriptions from the catalog and typed execution metadata. Sanitize IDs and allow only internal relative deep links.

- [ ] **Step 4: Implement history/recovery UI**

  Add an expandable `ExecutionDiagnosisCard`. For `waiting_connection`, navigate to the exact scenario/node and open its connection panel. For `WORKER_OFFLINE`, show admin health only to administrators and a user-safe “worker recovery in progress” message to normal users. Retry creates a new Queue event only when eligible and idempotency rules permit it.

- [ ] **Step 5: Verify and commit**

  Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

  Commit: `git add src/lib/automation/runtime/execution-diagnosis.service.ts app/api/automation components/Automation tests/automation-diagnostics-ui.test.ts && git commit -m "feat: explain and recover automation failures"`

---

## Task 16: Integrate, document, build, and prepare the user review report

**Files:**

- Create: `docs/mobile-companion/setup-and-release.md`
- Create: `docs/operations/automation-worker-railway.md`
- Modify: `mobile-companion/README.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `D:\DREAMWISH-Companion\README.md`
- Modify: `D:\DREAMWISH-Companion\.gitignore`

- [ ] **Step 1: Replace the embedded mobile reference with a migration pointer**

  Keep `D:\gremmy\mobile-companion` only as a short deprecation README pointing to the separate repository and versioned API contract. Remove the old Kotlin/Swift reference snippets after verifying equivalent code exists and is committed in `D:\DREAMWISH-Companion`; use `apply_patch` for tracked-file deletion.

- [ ] **Step 2: Write deployment and recovery documentation**

  Document environment variables, PostgreSQL requirement, Railway web/Worker service separation, heartbeat validation, QR association files, Android SHA-256 fingerprint update, pairing protocol version, device revocation, TOTP recovery, trusted-source reversal, DLQ/retry behavior, Play AAB signing, and the iOS macOS/TestFlight boundary. Include no real secret values.

- [ ] **Step 3: Run complete web verification**

  From `D:\gremmy` run in this order:

  1. `git status --short --branch`
  2. `npm.cmd run lint`
  3. `npm.cmd run typecheck`
  4. `npm.cmd test`
  5. `npm.cmd run build`

  Expected: lint/typecheck/tests/build exit 0. Record the exact test count and build result. If any command fails, fix it and rerun the complete sequence from step 1.

- [ ] **Step 4: Run complete Companion verification**

  From `D:\DREAMWISH-Companion` run:

  1. `git status --short --branch`
  2. `npm.cmd run lint`
  3. `npx.cmd tsc --noEmit`
  4. `npm.cmd test -- --runInBand`
  5. `android\gradlew.bat testDebugUnitTest`
  6. `android\gradlew.bat assembleDebug`
  7. with release signing variables available, `android\gradlew.bat bundleRelease`

  Expected: all locally runnable checks exit 0; APK exists; AAB exists only when approved signing inputs are supplied. Report `connectedDebugAndroidTest` as run only if an emulator/device is available. Report iOS `xcodebuild` as pending macOS evidence rather than passed on Windows.

- [ ] **Step 5: Perform security and artifact inspection**

  Run repository searches for private keys, OAuth/access tokens, TOTP secrets, raw notification fixtures, signing passwords, `.env.local`, `.jks`, `.keystore`, `.p12`, `.mobileprovision`, and provisioning data. Confirm generated APK/AAB and build directories are ignored. Verify public API snapshots contain no secret/raw fields.

- [ ] **Step 6: Commit documentation and final integration fixes**

  In `D:\gremmy` commit: `git add README.md .gitignore docs mobile-companion && git commit -m "docs: add companion and worker operations"`

  In `D:\DREAMWISH-Companion` commit: `git add README.md .gitignore && git commit -m "docs: add companion release guide"`

- [ ] **Step 7: Prepare the review report without pushing**

  Report:

  - web and Companion commit lists and changed-file summaries;
  - TOTP enrollment/login/recovery verification;
  - QR pairing and restart/replay security verification;
  - Android allowed-package/revenue sync and APK/AAB paths;
  - iPhone implemented source and explicit unexecuted macOS checks;
  - provisional/confirmed revenue and trusted-source test results;
  - Railway Worker config, heartbeat, preflight, stale-queue, and remediation results;
  - lint/typecheck/test/build output for both repositories;
  - any store credentials, Railway service creation, emulator/device, or macOS actions still requiring the user.

  Do not push until the user gives final approval after reading this report.
