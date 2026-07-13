# Mobile Pairing Contacts Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pair real Android and iPhone companion apps to an owner account and synchronize approved revenue signals, contacts, and calendars without collecting SMS or call logs.

**Architecture:** A short-lived one-time pairing challenge binds a generated device public key to one owner. Every device envelope is signed, sequenced, idempotent, and encrypted. Contacts and calendars enter owner-scoped candidate stores; writes back to a phone require explicit per-contact or calendar-write approval.

**Tech Stack:** Next.js 15 server routes, TypeScript, Node crypto, Kotlin Android services, Swift iOS app/share extension, Firebase authenticated web session.

## Global Constraints

- Collect only revenue signals, contacts, and calendars.
- Never request or collect SMS and call logs.
- Android notification access is opt-in and package allowlisted.
- iPhone revenue input uses Share Extension; do not claim automatic third-party notification access.
- Production signing needs user-owned Google Play and Apple Developer credentials.
- Never stage `.superpowers/` or `h origin main`.

---

### Task 1: Device pairing and sync domain

**Files:**
- Create: `src/lib/devices/device.types.ts`
- Create: `src/lib/devices/device.repository.ts`
- Create: `src/lib/devices/pairing.service.ts`
- Create: `src/lib/devices/device-envelope.ts`
- Test: `tests/device-pairing.test.ts`

**Interfaces:**
- Produces `createPairingChallenge(ownerId)`, `pairDevice(input)`, `verifyDeviceEnvelope(input)`.

- [ ] **Step 1: Test expiry, one-time use, signature, owner isolation, and replay rejection**

```ts
const challenge = await createPairingChallenge("owner-a");
const device = await pairDevice({ ownerId: "owner-a", challengeId: challenge.id, publicKey, platform: "android", name: "Pixel" });
await assert.rejects(() => pairDevice({ ownerId: "owner-a", challengeId: challenge.id, publicKey, platform: "android", name: "Pixel 2" }), /challenge_used/u);
```

- [ ] **Step 2: Implement repositories with owner ID and hashed challenge tokens**
- [ ] **Step 3: Verify Ed25519 signatures, timestamps, sequence, event ID, and payload limits**
- [ ] **Step 4: Run tests and commit**

Commit: `feat: add secure device pairing domain`

---

### Task 2: Device APIs and web management UI

**Files:**
- Create: `app/api/devices/pairing-challenges/route.ts`
- Create: `app/api/devices/pair/route.ts`
- Create: `app/api/devices/route.ts`
- Create: `app/api/devices/[deviceId]/route.ts`
- Create: `app/api/devices/[deviceId]/sync/route.ts`
- Create: `components/Business/DeviceConnectionPanel.tsx`
- Create: `components/Business/DevicePairingDialog.tsx`
- Modify: `components/Business/BusinessHub.tsx`
- Test: `tests/device-api-owner-isolation.test.ts`

- [ ] **Step 1: Test auth, entitlement, owner scoping, expiry, and revocation**
- [ ] **Step 2: Implement challenge, pair, list, pause, and revoke routes**
- [ ] **Step 3: Render Android/iPhone buttons, pairing code/QR payload, permissions, last sync, and disconnect**
- [ ] **Step 4: Keep an honest no-build state when native download URLs are not configured**
- [ ] **Step 5: Run tests and commit**

Commit: `feat: add device pairing APIs and UI`

---

### Task 3: Contact candidates and phone contact writes

**Files:**
- Create: `src/lib/devices/contact-sync.repository.ts`
- Create: `src/lib/devices/contact-matcher.ts`
- Create: `app/api/devices/[deviceId]/contact-candidates/route.ts`
- Create: `app/api/devices/[deviceId]/contact-candidates/import/route.ts`
- Create: `app/api/devices/[deviceId]/contacts/route.ts`
- Create: `components/CRM/PhoneContactImport.tsx`
- Test: `tests/device-contact-sync.test.ts`

**Interfaces:**
- Produces contact candidate states `new | duplicate | conflict | changed` and signed device command `create_contact`.

- [ ] **Step 1: Test normalize, duplicate, conflict, CRM import, and no auto-delete**
- [ ] **Step 2: Store only minimum contact fields and encrypted device mappings**
- [ ] **Step 3: Add reviewed CRM import and per-contact phone write command**
- [ ] **Step 4: Add CRM UI for phone import and phone address-book creation**
- [ ] **Step 5: Run tests and commit**

Commit: `feat: sync phone contacts with CRM`

---

### Task 4: Calendar candidates and optional two-way sync

**Files:**
- Create: `src/lib/devices/calendar-sync.repository.ts`
- Create: `src/lib/devices/calendar-sync.service.ts`
- Create: `app/api/devices/calendar-candidates/route.ts`
- Create: `app/api/devices/calendar-candidates/import/route.ts`
- Create: `app/api/devices/[deviceId]/calendar-sync/route.ts`
- Test: `tests/device-calendar-sync.test.ts`

- [ ] **Step 1: Test timezone, recurrence, deduplication, read-only default, and conflict candidates**
- [ ] **Step 2: Implement owner-scoped event mappings and cursors**
- [ ] **Step 3: Implement selected import and explicit two-way device commands**
- [ ] **Step 4: Run tests and commit**

Commit: `feat: sync device calendars`

---

### Task 5: Android companion implementation

**Files:**
- Modify: `mobile-companion/android/AndroidManifest.xml`
- Modify: `mobile-companion/android/NotificationCaptureService.kt`
- Create: `mobile-companion/android/PairingActivity.kt`
- Create: `mobile-companion/android/ContactSyncWorker.kt`
- Create: `mobile-companion/android/CalendarSyncWorker.kt`
- Create: `mobile-companion/android/SignedEnvelope.kt`
- Test: `tests/mobile-revenue-bridge.test.ts`

- [ ] **Step 1: Assert manifest excludes SMS and call-log permissions and includes contacts, calendar, camera, network, and notification-listener declarations**
- [ ] **Step 2: Implement pairing payload scan/manual entry, device Ed25519 key generation, and encrypted local session**
- [ ] **Step 3: Filter notifications by user allowlist and upload signed provisional events**
- [ ] **Step 4: Sync selected contacts/calendars and execute approved create-contact/calendar commands**
- [ ] **Step 5: Run contract tests and document Android signing inputs**
- [ ] **Step 6: Commit: `feat: implement Android mobile companion sync`**

---

### Task 6: iPhone companion implementation

**Files:**
- Modify: `mobile-companion/ios/Info.plist`
- Modify: `mobile-companion/ios/ShareViewController.swift`
- Create: `mobile-companion/ios/PairingView.swift`
- Create: `mobile-companion/ios/ContactSyncService.swift`
- Create: `mobile-companion/ios/CalendarSyncService.swift`
- Create: `mobile-companion/ios/SignedEnvelope.swift`
- Test: `tests/mobile-revenue-bridge.test.ts`

- [ ] **Step 1: Assert usage descriptions cover Contacts, Calendars, Camera, and Photos and contain no SMS/call-log claims**
- [ ] **Step 2: Implement pairing payload scan/manual entry and Secure Enclave/Keychain-backed signing identity**
- [ ] **Step 3: Upload Share Extension text/images as signed provisional revenue input**
- [ ] **Step 4: Sync selected contacts/calendars and execute approved create-contact/calendar commands**
- [ ] **Step 5: Document bundle IDs, app groups, signing, and provisioning inputs**
- [ ] **Step 6: Commit: `feat: implement iPhone mobile companion sync`**

---

### Task 7: Mobile verification

- [ ] Run: `npm test -- --test-name-pattern "device|mobile|calendar"`
- [ ] Run: `npm run typecheck`
- [ ] Run: `npm run build`
- [ ] Verify web pairing with a generated test key and signed envelopes.
- [ ] Verify contact and calendar candidate import, conflict handling, phone contact command, pause, and revoke.
- [ ] Verify Android/iPhone code does not request SMS or call-log permissions.
- [ ] Record that real store-signed device installation is pending only when signing credentials are unavailable; do not label it connected.
- [ ] Commit: `test: verify mobile device integration`

