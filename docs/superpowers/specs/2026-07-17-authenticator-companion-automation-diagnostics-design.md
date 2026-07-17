# Authenticator, Mobile Companion, Revenue Sync, and Automation Diagnostics Design

## 1. Objective

Extend DREAMWISH with four connected but separately secured capabilities:

1. Google Authenticator-compatible TOTP enrollment and sign-in verification;
2. a separately maintained Android/iPhone DREAMWISH Companion application;
3. signed mobile revenue-signal ingestion with reviewed Business overview totals; and
4. durable Automation Queue diagnostics that explain why an execution is queued or failed and how to recover it.

The existing web/server repository remains at `D:\gremmy`. The Companion application is a separate Git repository at `D:\DREAMWISH-Companion`. Android is prepared for Google Play distribution. The iPhone application is prepared for private TestFlight distribution until a public App Store release is chosen.

## 2. Non-goals and platform constraints

- Google Authenticator is an account second-factor mechanism. It does not pair a phone, read notifications, or transfer business data.
- Android may read notifications only after the user explicitly grants Notification Listener access. DREAMWISH reads only packages selected by the user.
- An ordinary iPhone application cannot automatically read another application’s notifications. iPhone revenue capture uses a Share Extension, verified Gmail alerts, or manual import.
- The Companion repository will contain signing configuration hooks and release instructions, but no Play signing key, Apple certificate, provisioning profile, OAuth secret, TOTP secret, or production token.
- Android builds and tests may run on Windows when the Android SDK and JDK are available. iPhone compilation, signing, and TestFlight upload require macOS/Xcode or a macOS CI runner.
- Store publication and external messages are not performed without a later explicit user instruction and the required store credentials.

## 3. Repository boundaries

### 3.1 DREAMWISH web and server — `D:\gremmy`

The existing Next.js application owns:

- TOTP enrollment, challenge verification, recovery codes, and session issuance;
- QR pairing session creation, web confirmation, and device activation;
- device public-key registration and signed-envelope verification;
- revenue candidate persistence, review actions, and Business overview aggregation;
- Automation Worker heartbeat persistence, Queue diagnosis, error classification, and recovery guidance;
- account settings, Business, Automation history, and administrator UI.

### 3.2 DREAMWISH Companion — `D:\DREAMWISH-Companion`

The separate bare React Native repository owns:

- shared TypeScript screens, API client, local queue, permissions, and connection state;
- Android Kotlin modules for Notification Listener, encrypted key storage, contacts, and calendar access;
- iOS Swift modules for Share Extension, Keychain, contacts, and calendar access;
- HTTPS App Link/Universal Link and `dreamwish://` fallback handling;
- signed sync envelopes and offline retry;
- Android Gradle Play release configuration and iOS Xcode/TestFlight project files.

The Companion consumes a versioned HTTP contract published by the web repository. It never receives the user’s password, Firebase token, social OAuth token, integration token, or TOTP secret.

## 4. Google Authenticator-compatible TOTP

### 4.1 Enrollment

The signed-in user opens `Settings → Security → Authenticator`. The server creates a pending enrollment with a random 160-bit secret, issuer `DREAMWISH`, the account email, a ten-minute expiry, and an `otpauth://totp/...` URI. The UI renders the URI as a QR code and also exposes a copyable manual key.

The user scans the QR code with Google Authenticator and enters the displayed six-digit code. The server validates the code with a narrow clock-skew window, rejects replay of an already accepted counter, activates the encrypted secret, and issues one-time recovery codes. Recovery-code plaintext is displayed once; only keyed hashes are persisted.

### 4.2 Sign-in enforcement

Password, Kakao, and Naver primary authentication do not issue a full application session when TOTP is enabled. They create a short-lived, single-purpose MFA challenge. The user must provide a valid TOTP code or unused recovery code before the hardened DREAMWISH session cookie is issued.

Enrollment, verification, recovery-code use, regeneration, and disable operations are rate limited and append audit events. Disabling TOTP or regenerating recovery codes requires recent primary reauthentication. Secrets and recovery-code plaintext never enter logs or client persistence.

## 5. QR phone pairing

### 5.1 User flow

1. The user selects Android or iPhone in the Business phone-connection panel.
2. The server persists a ten-minute, owner-bound, one-time pairing session and returns a public QR payload.
3. The website renders an HTTPS App Link/Universal Link QR with a `dreamwish://` fallback.
4. The phone’s normal camera scans the QR and opens the installed Companion application.
5. The Companion generates a non-exportable signing key in Android Keystore or iOS Keychain/Secure Enclave when supported.
6. The Companion registers the public key and receives a six-digit confirmation code, which it displays on the phone.
7. The user enters that code on the website.
8. The server verifies the owner, platform, public token, code hash, expiry, failure count, and unused state, then activates the device.
9. The Companion polls the one-time pairing result and receives only its device identifier and server acknowledgement. Future requests are authenticated by signatures from the device-held private key.

### 5.2 Pairing security

Pairing tokens and confirmation codes are stored only as keyed hashes. A pairing session expires after ten minutes, permits at most five failed confirmation attempts, and is single-use. Pairing and confirmation endpoints are rate limited by account, session, and network source. Browser, server, and Worker restarts do not lose state.

Every sync envelope contains `deviceId`, `sequence`, `eventId`, `capturedAt`, `sentAt`, `payloadVersion`, and a signature. The server verifies owner/device state, public-key signature, monotonic sequence, timestamp window, event idempotency, payload size, and per-device rate limit before accepting data. Revoked or paused devices fail closed.

## 6. Companion application

### 6.1 Shared screens

- welcome and permission explanation;
- pairing-link handling and phone confirmation code;
- connection state and last successful sync;
- contacts, calendar, and revenue permissions;
- selected Android financial applications;
- pending local uploads and retry state;
- privacy, data deletion, pause, and disconnect controls.

### 6.2 Android

Android uses `NotificationListenerService` only after OS approval. The user selects bank/payment package names from installed applications. Notifications from packages outside that allowlist are discarded on-device. The application locally extracts the smallest necessary title/text/time fields, redacts account-like values, classifies likely income, expense, cancellation, or ambiguity, and uploads signed revenue signals.

The Gradle project produces a debug APK for development and a signed AAB input for Google Play. The release signing key is supplied only by local or CI environment configuration. Play Console materials document Notification Listener, contacts, calendar, network, and data-safety usage accurately.

### 6.3 iPhone

iPhone uses a Share Extension for transaction text explicitly shared by the user. It may also use verified Gmail transaction alerts and manual import through the web application. The UI must never describe iPhone as automatically reading bank push notifications. Keychain stores device key references and sequence state. The Xcode project is prepared for TestFlight and requires macOS for archive/sign/upload.

## 7. Revenue signal lifecycle

Mobile revenue signals enter as `provisional`. The Business overview immediately shows a `확인 대기 매출` card with source application, captured time, parsed direction, amount, counterparty hint, confidence, and duplicate/cancellation flags. Provisional signals do not change confirmed financial totals.

The user can:

- confirm as revenue;
- change to expense;
- mark as personal;
- mark as duplicate; or
- reject/correct parsed values.

Only confirmed income contributes to total revenue, period revenue, and net profit. Duplicate event IDs, matching transaction fingerprints, and cancellation messages are linked and suppressed. An optional per-Android-app auto-confirm rule may be enabled only after the user explicitly trusts that app; it applies only to high-confidence income signals and remains reversible through an audit trail.

Sensitive raw notification text remains encrypted. Account and card identifiers are redacted before upload. Revenue signals are not sent to an AI provider by default.

## 8. Automation Queue diagnostics

### 8.1 Root cause addressed

The web process currently creates PostgreSQL Queue jobs, but the repository has no dedicated Railway Automation Worker service configuration. A job can therefore remain `queued` indefinitely even though the enqueue request succeeded. Environment-variable presence alone does not prove that a Worker is alive.

### 8.2 Worker deployment and heartbeat

The web repository adds a Railway service definition whose start command is `npm run automation:worker`. Web and Worker use the same `DATABASE_URL`, automation credential encryption key, auth/coupon secrets required by shared repositories, and application version.

Each running Worker writes a PostgreSQL heartbeat containing `workerId`, version, capabilities, start time, last-seen time, and shutdown state. Heartbeats expire rather than relying on server memory. The administrator system page distinguishes `configured` from `healthy` without exposing environment values.

### 8.3 Preflight and durable diagnosis

Manual/test/live execution performs structural, ActionDefinition, connection, credential, scope, and adapter readiness checks before Queue insertion. A missing or invalid connection creates a durable `waiting_connection` execution with an error code and does not enqueue an unexecutable job. Restoring the exact connection creates a new Queue job and event.

A normally queued job displays its position and next run time. When it remains queued for more than thirty seconds and no compatible Worker heartbeat is fresh, the detail API derives `WORKER_OFFLINE`. This is a diagnosis, not a false terminal transition; the persisted execution stays queued and resumes when a Worker returns.

Worker and Adapter failures persist a safe error code and message at execution and step level. The detail response adds a remediation descriptor derived from a server-owned catalog:

| Code | User-facing cause | Recovery |
| --- | --- | --- |
| `WORKER_OFFLINE` | Automation Worker is not responding | Start/redeploy the Railway Worker and retry after heartbeat returns |
| `CONNECTION_REQUIRED` | No connection is selected for the Action | Open the exact node and select a verified connection |
| `CONNECTION_NOT_FOUND` | The selected connection no longer exists | Reconnect the app and select the new connection |
| `CREDENTIAL_INVALID` | Credential is expired, revoked, or unverified | Reconnect or reverify the credential |
| `SCOPE_INSUFFICIENT` | Required OAuth permission is missing | Reauthorize with the listed scopes |
| `RATE_LIMITED` | Provider rate limit was reached | Show retry time and allow the scheduled retry |
| `ADAPTER_UNAVAILABLE` | The pinned Adapter version cannot execute | Select a supported Action/Adapter version |
| `PROVIDER_AUTH_FAILED` | The provider rejected authentication | Test the connection and reconnect the account |

Automation history displays status, error code, failing step, safe reason, recovery steps, relevant deep link, retry eligibility, retry time, API request ID, rate-limit state, and Adapter latency. Secrets and provider response bodies remain masked.

## 9. Data model

PostgreSQL remains authoritative for production. New or extended records include:

- `account_totp_factors`: owner, encrypted secret, status, last accepted counter, created/verified/disabled timestamps;
- `account_totp_challenges`: purpose, expiry, failure count, consumed timestamp;
- `account_recovery_codes`: keyed code hash, used timestamp;
- `device_pairing_sessions`: owner, platform, token hash, code hash, public key, state, failure count, expiry, consumed timestamp;
- `paired_devices`: public key algorithm/material, app version, permissions, sequence, last sync, state;
- revenue candidates: device, fingerprint, classification, confidence, confirmation policy, audit state;
- `automation_worker_heartbeats`: Worker identity, version, capabilities, started/last-seen/stopped timestamps;
- execution and step error fields: stable code and safe message, with remediation derived from code rather than storing arbitrary HTML.

Local JSON storage may remain a development fallback where the existing repository architecture supports it, but production TOTP, pairing, public keys, revenue candidates, and Worker heartbeats use PostgreSQL.

## 10. Error handling and observability

- Public APIs return stable Korean-safe errors without stack traces, provider secrets, raw notifications, or database messages.
- Every authentication, pairing, device state, revenue review, Queue transition, and administrative recovery action appends an audit event.
- Transient provider and rate-limit errors retain retry metadata; permanent configuration and connection errors stop automatic retries until corrected.
- QR/TOTP attempts use explicit expiry and attempt counters. Clock drift is bounded and surfaced as a user-correctable device-time error.
- Companion offline uploads are idempotent and retained in an encrypted local queue until acknowledged or explicitly deleted.
- Worker health is observed through durable heartbeat age, not configuration guesses or process memory.

## 11. Testing and verification

### 11.1 Web/server

- TOTP RFC test vectors, enrollment, replay, expiry, rate limit, recovery codes, and session gating;
- owner isolation, encrypted-at-rest checks, and secret masking;
- QR token expiry, five-attempt limit, one-time use, platform binding, cross-owner rejection, and signed-envelope replay rejection;
- revenue parsing, redaction, duplicate/cancellation handling, review transitions, trusted-app policy, and Business KPI inclusion;
- Worker heartbeat, stale queued diagnosis, preflight connection failures, remediation mapping, retry timing, restart recovery, and DLQ behavior;
- existing lint, typecheck, complete test suite, and Next.js production build.

### 11.2 Companion

- shared TypeScript API/state tests;
- Android JVM tests for allowed packages, parsing, redaction, fingerprinting, and signed batches;
- Android instrumentation tests for pairing links, Keystore, permissions, offline retry, and disconnect;
- Android debug APK and release AAB build;
- iOS XCTest source for pairing links, Keychain, Share Extension import, redaction, and signed batches;
- iPhone build/sign/TestFlight verification deferred to macOS/Xcode or macOS CI with explicit evidence.

## 12. Delivery sequence

1. TOTP server model/API/UI and session gating;
2. PostgreSQL QR pairing/public-key contract and web UI;
3. separate Companion repository with Android/iPhone project scaffolding and shared contract;
4. Android notification capture and signed sync;
5. iPhone Share Extension and signed sync;
6. reviewed revenue overview and trusted-app policy;
7. Railway Automation Worker service, heartbeat, preflight, diagnostics, and recovery UI;
8. full verification, Android artifacts, deployment documentation, and final user review before store publishing.

## 13. Acceptance criteria

- A user can enroll Google Authenticator by scanning a web QR and confirming a six-digit code, then must satisfy MFA on subsequent sign-ins.
- A user can scan the website’s phone-pairing QR with the normal camera, see a six-digit code in the Companion, enter it on the website, and obtain an active restart-safe device connection.
- Android uploads only user-allowed financial notifications; iPhone uses explicit share/Gmail/manual input.
- Mobile signals appear immediately as pending review, and only confirmed or explicitly trusted high-confidence income changes Business revenue totals.
- A newly queued automation is claimed by a healthy Railway Worker. A stale queued execution shows `WORKER_OFFLINE`, its cause, and exact recovery steps.
- Connection, credential, scope, rate-limit, Adapter, and provider-auth failures appear in execution history with the failing step and actionable remediation.
- No secret, recovery code, QR token, private key, raw access token, or unmasked financial identifier is committed or returned through public diagnostics.
- Android produces a testable APK and Play-ready AAB input. iPhone source is TestFlight-ready and clearly reports the macOS signing boundary.
