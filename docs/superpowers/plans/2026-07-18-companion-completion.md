# DREAMWISH Companion Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish and verify the standalone React Native companion in `D:\DREAMWISH-Companion`, including QR/App Links pairing, Android notification capture and offline sync, iPhone Share Extension and retry, push registration, revenue review, and real-device release evidence.

**Architecture:** `D:\DREAMWISH-Companion` is the only release source of truth. The existing `D:\gremmy\mobile-companion` code is a comparison source only; changes are selectively reconciled through reviewed diffs. Each device owns a hardware-backed signing key, sends monotonic signed envelopes, stores offline events encrypted, and never classifies captured revenue as accepted business data until server-side review.

**Tech Stack:** React Native 0.86.0, React 19.2.3, TypeScript, Kotlin, Android Keystore, WorkManager, NotificationListenerService, Firebase Messaging 23.0.0, Swift, Keychain, App Groups, Share Extension, Firebase Messaging, Jest, XCTest, Android unit/instrumentation tests.

## Global Constraints

- Never replace the standalone repository wholesale or copy `.git`, signing keys, generated build folders, Firebase configuration, or provisioning material.
- Android captures notifications only from user-allowlisted packages and stores sanitized structured fields; iPhone captures only content the user explicitly shares.
- Private signing keys never leave Android Keystore or iOS Keychain and are never written to AsyncStorage, logs, crash metadata, or server responses.
- Pairing challenges are one-time, short-lived, attempt-limited, owner-bound, and confirmed by signatures over canonical bytes.
- Offline queues are encrypted, bounded, ordered, deduplicated, and expose permanently rejected events to the user.
- Push payloads contain IDs and allowlisted routes, not revenue text, OAuth credentials, or customer data.
- Captured revenue is always a review candidate; duplicate, personal, rejected, and accepted states are auditable.
- Release completeness requires Android and iPhone physical-device evidence. Simulator/emulator tests alone do not qualify.
- Write a failing test before each implementation and commit every independently testable task in the repository that owns the files.

---

### Task 1: Baseline and reconcile the two companion trees safely

**Files:**
- Create: `D:\DREAMWISH-Companion\docs\reconciliation-report.md`
- Create: `D:\DREAMWISH-Companion\scripts\verify-source-of-truth.mjs`
- Modify: `D:\DREAMWISH-Companion\package.json`
- Modify: `D:\DREAMWISH-Companion\package-lock.json`
- Test: `D:\DREAMWISH-Companion\__tests__\source-of-truth.test.ts`

**Interfaces:** `verify-source-of-truth.mjs` reports missing native capabilities, forbidden generated/secret files, and exact dependency versions; it never writes application files.

- [ ] **Step 1: Capture clean baselines** with `git -C D:\DREAMWISH-Companion status --short`, `git -C D:\gremmy status --short`, file hashes, and test results before any reconciliation.
- [ ] **Step 2: Write the failing source-of-truth test** requiring `typecheck`, exact versions for NetInfo `11.4.1`, Firebase app/messaging `23.0.0`, React Native `0.86.0`, and the Android/iOS native capability files.
- [ ] **Step 3: Run RED:** `npm.cmd --prefix D:\DREAMWISH-Companion test -- --runInBand`.
- [ ] **Step 4: Produce a three-way reconciliation report** classifying each differing file as standalone-only, workspace-only, or divergent. Selectively apply reviewed source changes with patches; do not copy directories.
- [ ] **Step 5: Pin dependencies and scripts:** add `typecheck`, `test:android-unit`, and `verify:source`; regenerate the lockfile with `npm.cmd --prefix D:\DREAMWISH-Companion install --save-exact`.
- [ ] **Step 6: Run GREEN:** `npm.cmd --prefix D:\DREAMWISH-Companion test -- --runInBand && npm.cmd --prefix D:\DREAMWISH-Companion run typecheck`.
- [ ] **Step 7: Commit:** `git -C D:\DREAMWISH-Companion commit -m "chore: reconcile companion source of truth"`.

---

### Task 2: Complete QR, custom-scheme, App Link, and Universal Link pairing

**Files:**
- Modify: `D:\DREAMWISH-Companion\src\screens\PairingScreen.tsx`
- Modify: `D:\DREAMWISH-Companion\src\services\pairing-store.ts`
- Modify: `D:\DREAMWISH-Companion\src\api\companion-api.ts`
- Modify: `D:\DREAMWISH-Companion\src\navigation\AppNavigator.tsx`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\AndroidManifest.xml`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Info.plist`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\DREAMWISHCompanion.entitlements`
- Modify: `D:\gremmy\app\companion\pair\page.tsx`
- Modify: `D:\gremmy\app\.well-known\assetlinks.json\route.ts`
- Modify: `D:\gremmy\app\.well-known\apple-app-site-association\route.ts`
- Modify: `D:\gremmy\src\lib\devices\app-link-config.ts`
- Test: `D:\DREAMWISH-Companion\src\__tests__\pairing-links.test.ts`
- Test: `D:\gremmy\tests\companion-app-links.test.ts`

**Interfaces:** accepted links are `dreamwish://companion/pair?...` and `https://<APP_HOST>/companion/pair?...`; query values are validated by the shared pairing schema before navigation.

- [ ] **Step 1: Write failing tests** for QR payload, cold/warm link open, expired session, wrong host, missing code, replay, and safe browser fallback.
- [ ] **Step 2: Run RED** in both repositories.
- [ ] **Step 3: Implement one link parser** and route all QR/manual/deep-link inputs through it; show exact errors and a create-new-QR action.
- [ ] **Step 4: Serve standards-compliant association files** from configured Android certificate SHA-256 and Apple Team ID/bundle ID. Fail the release verifier if production identifiers are absent.
- [ ] **Step 5: Run GREEN:** both Jest suites, root tests, and typechecks.
- [ ] **Step 6: Commit in each owning repository** with `feat: complete companion deep-link pairing`.

---

### Task 3: Harden device keys and canonical signed envelopes

**Files:**
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\security\DeviceKeyStore.kt`
- Create: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\security\CanonicalEnvelope.kt`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Security\DeviceKeyStore.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Security\CanonicalEnvelope.swift`
- Modify: `D:\DREAMWISH-Companion\src\native\device-keys.ts`
- Modify: `D:\gremmy\src\lib\devices\signed-envelope.ts`
- Modify: `D:\gremmy\src\lib\devices\device-signature.ts`
- Test: `D:\DREAMWISH-Companion\android\app\src\test\java\kr\co\dreamwish\companion\CanonicalEnvelopeTest.kt`
- Test: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanionTests\PairingAndShareTests.swift`
- Test: `D:\gremmy\tests\device-signed-envelope.test.ts`

**Interfaces:** canonical JSON sorts object keys recursively, preserves array order, omits only `signature`, uses UTF-8, and signs SHA-256 with P-256 ECDSA.

- [ ] **Step 1: Add cross-language golden vectors** for Unicode, decimals, nested arrays, signature omission, tampering, and sequence replay.
- [ ] **Step 2: Run RED** for Kotlin, XCTest, and Node tests.
- [ ] **Step 3: Implement the identical canonicalization contract** and hardware-backed key generation. Return public SPKI only.
- [ ] **Step 4: Make server verification constant-behavior** for invalid signatures and fence every accepted envelope by `deviceId + sequence + eventId`.
- [ ] **Step 5: Run GREEN** across all three suites.
- [ ] **Step 6: Commit:** `feat: harden companion signed envelopes`.

---

### Task 4: Finish Android allowlisted notification capture

**Files:**
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\notifications\FinancialNotificationListener.kt`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\notifications\NotificationSanitizer.kt`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\sync\EncryptedEventStore.kt`
- Modify: `D:\DREAMWISH-Companion\src\screens\PermissionsScreen.tsx`
- Create: `D:\DREAMWISH-Companion\src\screens\NotificationSourcesScreen.tsx`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\AndroidManifest.xml`
- Test: `D:\DREAMWISH-Companion\android\app\src\test\java\kr\co\dreamwish\companion\NotificationSanitizerTest.kt`
- Test: `D:\DREAMWISH-Companion\src\__tests__\notification-permissions.test.ts`

**Interfaces:** users select installed packages; captures contain package, captured time, redacted text, parsed amount/direction, and notification fingerprint only.

- [ ] **Step 1: Write failing tests** for empty allowlist, non-allowlisted packages, OTP/password/card-number redaction, multi-line amounts, personal transfers, duplicates, disabled listener, and permission recovery instructions.
- [ ] **Step 2: Run RED** for Jest and Android unit tests.
- [ ] **Step 3: Store the allowlist encrypted** and drop rejected notifications before queue persistence. Never persist title/extras wholesale.
- [ ] **Step 4: Add permission/source UI** that deep-links to Notification Access settings and verifies the listener after return.
- [ ] **Step 5: Run GREEN** and perform an emulator smoke test with synthetic notifications.
- [ ] **Step 6: Commit:** `feat: finish Android revenue notification capture`.

---

### Task 5: Make Android offline synchronization durable and diagnosable

**Files:**
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\sync\RevenueSyncWorker.kt`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\java\kr\co\dreamwish\companion\sync\EncryptedEventStore.kt`
- Modify: `D:\DREAMWISH-Companion\src\storage\offline-queue.ts`
- Create: `D:\DREAMWISH-Companion\src\screens\SyncQueueScreen.tsx`
- Modify: `D:\DREAMWISH-Companion\src\screens\ConnectionScreen.tsx`
- Test: `D:\DREAMWISH-Companion\src\__tests__\offline-sync.test.ts`
- Test: `D:\DREAMWISH-Companion\android\app\src\androidTest\java\kr\co\dreamwish\companion\PairingAndQueueTest.kt`

**Interfaces:** batch maximum 50; exponential retry starts at 30 seconds; 401/403 pauses for re-pair; 409 sequence conflict fetches server state; 422 becomes visible rejection; 429/5xx/network retries; eight attempts move to manual retry.

- [ ] **Step 1: Write failing transition tests** for every status code, process death, device reboot, concurrent schedules, duplicate event, queue bound, manual retry, and deletion.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Replace broad HTTP handling with typed responses** and persist sequence atomically with the encrypted event batch.
- [ ] **Step 4: Add queue UI** with pending/retry/rejected counts, exact last error, next attempt, retry, and delete actions.
- [ ] **Step 5: Run GREEN** and verify airplane-mode capture followed by network restoration.
- [ ] **Step 6: Commit:** `feat: make Android companion sync durable`.

---

### Task 6: Encrypt iPhone Share Extension handoff and implement retry

**Files:**
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\ShareViewController.swift`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\ShareSanitizer.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\EncryptedShareQueue.swift`
- Create: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Sync\ShareQueueDrainer.swift`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\Sync\EncryptedEventStore.swift`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\AppDelegate.swift`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHShareExtension\DREAMWISHShareExtension.entitlements`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\DREAMWISHCompanion.entitlements`
- Test: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanionTests\PairingAndShareTests.swift`

**Interfaces:** the extension derives an App Group queue key from a Keychain access group, encrypts each item with AES-GCM, and uses an atomic file under the App Group rather than plaintext `UserDefaults`.

- [ ] **Step 1: Write failing XCTest cases** for text/provider attachments, redaction, ciphertext-at-rest, corrupt item quarantine, 100-item bound, duplicate share, drain acknowledgment, retry, and unavailable Keychain.
- [ ] **Step 2: Run RED:** `xcodebuild test -project ... -scheme DREAMWISHCompanion -destination 'platform=iOS Simulator,name=iPhone 16'` on macOS.
- [ ] **Step 3: Implement encrypted atomic handoff** and drain it on launch, foreground, background task opportunity, and network restoration.
- [ ] **Step 4: Expose retry/rejection state** in the shared React Native queue screen and state clearly that iOS cannot read other apps' notifications.
- [ ] **Step 5: Run GREEN** plus a physical iPhone share/offline/retry scenario.
- [ ] **Step 6: Commit:** `feat: encrypt and retry iPhone shared revenue`.

---

### Task 7: Register FCM tokens and handle safe mobile pushes

**Files:**
- Modify: `D:\DREAMWISH-Companion\android\app\build.gradle`
- Modify: `D:\DREAMWISH-Companion\android\app\src\main\AndroidManifest.xml`
- Modify: `D:\DREAMWISH-Companion\ios\Podfile`
- Modify: `D:\DREAMWISH-Companion\ios\DREAMWISHCompanion\AppDelegate.swift`
- Create: `D:\DREAMWISH-Companion\src\services\push-registration.ts`
- Modify: `D:\DREAMWISH-Companion\src\navigation\AppNavigator.tsx`
- Modify: `D:\gremmy\app\api\devices\[deviceId]\push-token\route.ts`
- Modify: `D:\gremmy\src\lib\automation\queue\notification-worker.ts`
- Test: `D:\DREAMWISH-Companion\src\__tests__\push-registration.test.ts`
- Test: `D:\gremmy\tests\companion-push.test.ts`

**Interfaces:** tokens register after pairing and rotate idempotently; data messages permit only `{ type, candidateId, route }` and navigate only to `/business/revenue`.

- [ ] **Step 1: Write failing tests** for permission refusal, token rotation, logout/revoke, invalid route, foreground/background notification, and missing Firebase server config.
- [ ] **Step 2: Run RED**.
- [ ] **Step 3: Implement registration/revocation** with typed remediation and no Firebase configuration files in Git.
- [ ] **Step 4: Implement allowlisted push handling** and a local notification that contains no sensitive revenue text.
- [ ] **Step 5: Run GREEN** in both repositories and send one Firebase test data message to each physical platform.
- [ ] **Step 6: Commit in each repository:** `feat: connect companion mobile push`.

---

### Task 8: Complete revenue candidate storage, review, and audit

**Files:**
- Modify: `D:\gremmy\src\lib\business\revenue.repository.ts`
- Modify: `D:\gremmy\src\lib\business\revenue-policy.ts`
- Modify: `D:\gremmy\src\lib\business\revenue-audit.repository.ts`
- Modify: `D:\gremmy\app\api\devices\[deviceId]\sync\route.ts`
- Create: `D:\gremmy\app\api\business\revenue\[candidateId]\review\route.ts`
- Modify: `D:\gremmy\components\Business\RevenueReviewPanel.tsx`
- Modify: `D:\gremmy\components\Business\TrustedRevenueSources.tsx`
- Test: `D:\gremmy\tests\device-revenue-review.test.ts`

**Interfaces:** review actions are `accept_revenue`, `accept_expense`, `mark_personal`, `mark_duplicate`, and `reject`; accepted candidates update ERP summaries exactly once.

- [ ] **Step 1: Write failing tests** for owner isolation, fingerprint/event duplicate, encrypted raw text, every review action, optimistic conflict, audit immutability, trust-rule effect, and push outbox creation.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement transactional review transitions** and idempotent ERP projection; never allow a device sync to set an accepted state directly.
- [ ] **Step 4: Add the review UI** with source, sanitized text, amount/direction correction, duplicate link, trust controls, and audit history.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: complete companion revenue review"`.

---

### Task 9: Produce release builds and physical-device evidence

**Files:**
- Create: `D:\DREAMWISH-Companion\docs\release-checklist.md`
- Create: `D:\DREAMWISH-Companion\docs\device-test-evidence.json`
- Create: `D:\DREAMWISH-Companion\scripts\verify-release-evidence.mjs`
- Modify: `D:\DREAMWISH-Companion\README.md`
- Test: `D:\DREAMWISH-Companion\__tests__\release-evidence.test.ts`

- [ ] **Step 1: Add a failing evidence test** requiring Android/iOS device model, OS version, build commit, timestamp, pairing, offline/retry, push, disconnect/revoke, and revenue review results.
- [ ] **Step 2: Run RED:** `npm.cmd --prefix D:\DREAMWISH-Companion test -- --runInBand`.

Expected: FAIL because the release evidence document and verifier do not exist.

- [ ] **Step 3: Run GREEN with all automated verification:**

```powershell
npm.cmd --prefix D:\DREAMWISH-Companion test -- --runInBand
npm.cmd --prefix D:\DREAMWISH-Companion run typecheck
npm.cmd --prefix D:\DREAMWISH-Companion run lint
Set-Location D:\DREAMWISH-Companion\android
.\gradlew.bat testDebugUnitTest assembleRelease
```

- [ ] **Step 4: On macOS, run** CocoaPods install, XCTest, Archive, App/Universal Link validation, and Share Extension signing checks.
- [ ] **Step 5: On physical Android and iPhone devices, execute** the full checklist and record artifact hashes/screenshots outside Git while committing the non-sensitive result JSON.
- [ ] **Step 6: Verify required external inputs:** Android upload key, `google-services.json`, Apple Team/profiles, `GoogleService-Info.plist`, APNs/FCM credentials, production host association files, and privacy disclosures.
- [ ] **Step 7: Commit:** `git -C D:\DREAMWISH-Companion commit -m "docs: verify companion release readiness"`.

## Completion Gate

- `D:\DREAMWISH-Companion` contains and tests every required mobile capability; `D:\gremmy\mobile-companion` is not shipped.
- QR, custom scheme, App Links, and Universal Links work after cold and warm starts.
- Android notification capture, encrypted offline queue, WorkManager retry, and review flow pass on a physical Android device.
- iPhone Share Extension, encrypted App Group queue, retry, push, and review flow pass on a physical iPhone.
- Push payloads and queues contain no unapproved sensitive content.
- Both repositories are clean, committed, and linked by recorded commit hashes.
- The app is reported as complete only after the evidence verifier passes; missing signing, Firebase, Apple, or device evidence is reported as an external release blocker.
