# Mobile Revenue Bridge Implementation Plan

> **Execution:** Apply `superpowers:executing-plans` inline and verify every behavior with a failing test first.

**Goal:** Support truthful Android automatic notification capture and iPhone share/manual import, storing every parsed transaction as an owner-scoped provisional revenue candidate until explicit confirmation.

**Architecture:** A pure Korean transaction parser feeds an owner-scoped idempotent repository. An authenticated Business revenue API accepts platform/capture metadata, rejects impossible iOS notification-listener claims, and supports provisional confirmation/rejection. Native reference modules enforce Android package allowlisting and expose an iOS Share Extension import path. Open Banking remains a disabled provider-neutral boundary.

**Tech Stack:** Next.js route handlers, TypeScript JSON repository, Kotlin Android `NotificationListenerService`, Swift iOS Share Extension reference module.

---

## Task 1: Parse and classify mobile transaction signals

**Files:**
- Create: `tests/mobile-revenue-bridge.test.ts`
- Create: `src/lib/business/revenue.types.ts`
- Create: `src/lib/business/revenue-parser.ts`

- [ ] Add failing fixtures for Korean deposit, withdrawal, card approval, cancellation, ambiguous text, and redacted account hints.
- [ ] Implement minimum local-safe parsing with confidence and evidence.
- [ ] Confirm GREEN.

## Task 2: Owner-scope provisional revenue lifecycle

**Files:**
- Modify: `tests/mobile-revenue-bridge.test.ts`
- Create: `src/lib/business/revenue.repository.ts`
- Create: `app/api/business/revenue/route.ts`

- [ ] Add failing tests for owner isolation, event idempotency, iOS automatic-listener rejection, provisional creation, confirmation, and rejection.
- [ ] Implement authenticated GET/POST/PATCH route and repository lifecycle.
- [ ] Keep unconfirmed and rejected events out of confirmed revenue.
- [ ] Confirm GREEN.

## Task 3: Expose platform-specific collection references and Business UI

**Files:**
- Modify: `tests/mobile-revenue-bridge.test.ts`
- Create: `mobile-companion/android/NotificationCaptureService.kt`
- Create: `mobile-companion/ios/ShareViewController.swift`
- Create: `mobile-companion/README.md`
- Create: `src/lib/business/open-banking-adapter.ts`
- Modify: `components/Business/BusinessHub.tsx`
- Modify: `src/lib/business/business-workspace.ts`

- [ ] Add failing static contracts for Android allowlisting, iOS share-only language, and disabled Open Banking.
- [ ] Add native reference implementations and documentation without claiming unsupported iOS notification access.
- [ ] Show provisional revenue candidates and confirm/reject controls in Sales.
- [ ] Include only confirmed candidates in confirmed revenue metrics.
- [ ] Confirm GREEN.

## Task 4: Verify the cross-platform slice

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect the scoped diff.
