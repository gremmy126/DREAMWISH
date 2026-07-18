# Production Operations and Domestic Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DREAMWISH automation, research, companion relay, PostgreSQL, Polar, KPN V2, and NHN KCP V1 production-operable with dedicated workers, durable webhooks/subscriptions, accurate entitlements, test payments, admin controls, and verifiable Railway configuration.

**Architecture:** The web service accepts authenticated requests but never performs long-running queue work. Dedicated Railway services run automation, billing, research, cron, and opaque relay processes with PostgreSQL heartbeats. Payment commands create idempotent attempts before provider calls; signed webhooks enter an inbox before processing; subscription and entitlement projections update transactionally and are reconciled by scheduled jobs.

**Tech Stack:** Railway, Next.js 15, PostgreSQL, Node 22, BullMQ/Valkey for research, PortOne Browser SDK V2 0.1.9, PortOne Server SDK 0.19.0, PortOne V1 REST, KPN, NHN KCP, Polar SDK 0.48.1, Firebase Cloud Messaging.

## Global Constraints

- Sandbox and live provider credentials, merchant/store/channel IDs, webhooks, attempts, and database rows are never mixed.
- The client never decides price, entitlement, subscription status, refund eligibility, or payment success.
- No payment or subscription is accepted from redirect/client output alone; the server verifies provider state and amount/currency/order ownership.
- Webhook signature verification occurs before inbox insertion; raw secrets and card data are neither stored nor logged.
- Every provider command and webhook is idempotent and safe under retries, duplication, reordering, and worker restart.
- Queue workers stop claiming new jobs when their required credentials, scopes, database, or provider health preflight fails.
- Heartbeat state and queued-stall diagnostics are visible without exposing secrets.
- Tests that can charge money use explicit sandbox accounts and fixed low test amounts. Live tests require an operator approval flag and are not part of automated CI.
- Write a failing test before each implementation and commit every independently testable task.

---

### Task 1: Make every Railway process a dedicated, health-checked service

**Files:**
- Modify: `railway.toml`
- Modify: `railway.automation-worker.toml`
- Modify: `railway.billing-worker.toml`
- Modify: `railway.cron.toml`
- Create: `railway.research-worker.toml`
- Create: `railway.local-agent-relay.toml`
- Create: `scripts/run-local-agent-relay.mjs`
- Modify: `scripts/run-automation-worker.mjs`
- Modify: `scripts/run-billing-worker.mjs`
- Create: `scripts/run-research-worker.mjs`
- Test: `tests/railway-service-contract.test.ts`

**Interfaces:** each worker registers `{ service, workerId, version, startedAt, lastSeenAt, capabilities }`, heartbeats every 10 seconds, becomes stale after 30 seconds, drains on SIGTERM, and exposes an internal `/health` endpoint or Railway health command.

- [ ] **Step 1: Write failing service-contract tests** for unique start commands, restart policy, health checks, no web start in workers, graceful shutdown, heartbeat, and required environment groups.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement dedicated process entries** with startup preflight and 30-second shutdown fencing; never swallow heartbeat failures indefinitely.
- [ ] **Step 4: Add a common worker status projection** in `src/lib/operations/worker-status.ts` that distinguishes healthy, starting, stale, stopped, credential-blocked, database-blocked, and provider-blocked.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: isolate Railway workers and relay"`.

---

### Task 2: Enforce queue preflight and actionable stall diagnostics

**Files:**
- Create: `src/lib/operations/preflight.types.ts`
- Create: `src/lib/operations/service-preflight.ts`
- Modify: `src/lib/automation/runtime/execution-enqueue.service.ts`
- Modify: `src/lib/automation/queue/worker.ts`
- Modify: `src/lib/automation/queue/worker-heartbeat.repository.ts`
- Modify: `src/lib/automation/runtime/automation-error-catalog.ts`
- Modify: `components/Automation/ExecutionDiagnosisCard.tsx`
- Modify: `components/Automation/DurableRunHistory.tsx`
- Test: `tests/automation-queue-preflight.test.ts`
- Test: `tests/automation-queued-stall-resolution.test.ts`

**Interfaces:** preflight findings carry `code`, `nodeId`, `appId`, `credentialId`, `missingScopes`, `message`, `resolution`, `settingsRoute`, and `retryable`; unsafe provider text is sanitized.

- [ ] **Step 1: Write failing tests** for missing OAuth, expired credential, missing scope, unsupported adapter, worker offline, database unavailable, quota exceeded, provider rate limit, and a job waiting behind another job.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Run credential/scope/adapter preflight before queue insertion.** Persist a rejected execution with all safe findings; do not insert a queue job.
- [ ] **Step 4: Diagnose queued jobs from heartbeat, claim lease, attempts, `availableAt`, dependency, and queue depth.** Return the exact owner action and automatic retry time.
- [ ] **Step 5: Render field/node-specific resolutions** and retain provider request IDs/statuses after redaction.
- [ ] **Step 6: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 7: Commit:** `git commit -m "feat: preflight automation queues and stalls"`.

---

### Task 3: Verify real PostgreSQL behavior with isolated integration schemas

**Files:**
- Modify: `scripts/verify-production-postgres.mjs`
- Modify: `scripts/verify-billing-postgres.mjs`
- Create: `scripts/verify-automation-postgres.mjs`
- Create: `scripts/verify-device-postgres.mjs`
- Create: `scripts/verify-research-postgres.mjs`
- Create: `tests/postgres-integration.helpers.ts`
- Create: `tests/postgres-concurrency.integration.test.ts`
- Modify: `package.json`

**Interfaces:** verification requires a non-production `POSTGRES_TEST_URL`, creates a random `codex_verify_<hex>` schema, sets `search_path`, and drops only that exact validated schema in `finally`.

- [ ] **Step 1: Write failing integration tests** for transaction rollback, advisory locking, SKIP LOCKED claim concurrency, lease fencing, duplicate webhooks, duplicate payment idempotency, owner isolation, and append-only audits.
- [ ] **Step 2: Run RED** against an empty disposable PostgreSQL database.
- [ ] **Step 3: Implement migration and verifier scripts** that refuse production host/database names and print table/index/constraint results without row content.
- [ ] **Step 4: Add `postgres:verify-all`** to run core, automation, billing, device, and research verification serially against the same disposable database.
- [ ] **Step 5: Run GREEN:** `npm.cmd run postgres:verify-all`.
- [ ] **Step 6: Commit:** `git commit -m "test: verify production PostgreSQL semantics"`.

---

### Task 4: Make PortOne configuration capability-driven and environment-safe

**Files:**
- Modify: `src/lib/billing/billing-config.ts`
- Modify: `src/lib/billing/billing-gateway.registry.ts`
- Modify: `app/api/billing/domestic/config/route.ts`
- Modify: `app/api/admin/billing/providers/route.ts`
- Modify: `components/billing/DomesticCheckoutDialog.tsx`
- Test: `tests/billing-provider-readiness.test.ts`

**Interfaces:** readiness returns separate `kpnOneTime`, `kpnRecurring`, `kcpRecurring`, `v2Webhook`, `v1Webhook`, `billingWorker`, and `postgres` states with missing variable names and console setup instructions.

- [ ] **Step 1: Write failing tests** for each credential/channel/store combination, sandbox/live cross-use, invalid public URL, missing encryption key, and incomplete webhook configuration.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Parse and validate provider configuration once** on the server; return only public store/channel IDs needed by the browser.
- [ ] **Step 4: Disable unsupported checkout choices** with the precise missing capability and setup path; never show a callable live button when readiness fails.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck`.
- [ ] **Step 6: Commit:** `git commit -m "feat: validate PortOne provider readiness"`.

---

### Task 5: Harden payment attempts and webhook inbox processing

**Files:**
- Modify: `src/lib/billing/billing-schema.ts`
- Modify: `src/lib/billing/payment-attempt.repository.ts`
- Modify: `src/lib/billing/billing-webhook.repository.ts`
- Modify: `src/lib/billing/billing-webhook.service.ts`
- Modify: `src/lib/billing/portone/v2-webhook.ts`
- Modify: `app/api/webhooks/portone/v2/route.ts`
- Modify: `app/api/webhooks/portone/v1/route.ts`
- Test: `tests/billing-webhook-inbox-concurrency.test.ts`
- Test: `tests/billing-payment-attempt-state.test.ts`

**Interfaces:** attempt transitions are fenced; inbox states are `received | processing | processed | retryable | dead_letter`; event uniqueness is `{ provider, environment, eventKey }`.

- [ ] **Step 1: Write failing tests** for duplicate, reordered, forged, wrong environment, wrong amount/currency/order, unknown payment, transient verification error, process crash, and dead-letter replay.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Store a redacted normalized envelope** after signature verification, claim inbox rows with SKIP LOCKED, and update attempt/subscription/event/entitlement in one transaction.
- [ ] **Step 4: Add reconciliation** for attempts stuck in provider-pending state and ensure replay cannot produce a second billing event or entitlement extension.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck && npm.cmd run billing:verify-postgres`.
- [ ] **Step 6: Commit:** `git commit -m "feat: harden billing webhook inbox"`.

---

### Task 6: Complete KPN V2 one-time and recurring payment verification

**Files:**
- Modify: `src/lib/billing/portone/kpn-v2.adapter.ts`
- Modify: `src/lib/billing/domestic-payment.service.ts`
- Modify: `app/api/billing/domestic/checkout/route.ts`
- Modify: `app/api/billing/domestic/verify/route.ts`
- Modify: `app/api/billing/domestic/billing-method/route.ts`
- Modify: `app/api/billing/domestic/subscription/route.ts`
- Modify: `components/billing/PortOneV2Checkout.tsx`
- Test: `tests/billing-portone-kpn.test.ts`
- Test: `tests/billing-kpn-recurring.integration.test.ts`

**Interfaces:** one-time test amount is fixed by server; recurring setup verifies the issued billing key with a small authorization/charge, revokes it in sandbox, and stores encrypted provider reference only for live subscription.

- [ ] **Step 1: Write failing adapter tests** for request construction, provider verification, canceled browser UI, wrong payment ID, partial failure, billing-key revoke, duplicate subscription, and timeout reconciliation.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement one-time and recurring services** with server-generated payment/order IDs and idempotency keys; translate every PortOne error into safe code/message/resolution/provider request ID.
- [ ] **Step 4: Run sandbox verification** with the configured KPN V2 test channel and record provider payment IDs in non-secret release evidence.
- [ ] **Step 5: Run GREEN:** automated tests, typecheck, and billing PostgreSQL verifier.
- [ ] **Step 6: Commit:** `git commit -m "feat: complete KPN V2 billing flows"`.

---

### Task 7: Complete NHN KCP V1 recurring billing and worker renewal

**Files:**
- Modify: `src/lib/billing/portone/kcp-v1.adapter.ts`
- Modify: `src/lib/billing/portone/v1-access-token.ts`
- Modify: `src/lib/billing/billing-worker.ts`
- Modify: `src/lib/billing/billing-charge-queue.repository.ts`
- Modify: `app/api/billing/domestic/billing-method/route.ts`
- Modify: `app/api/billing/domestic/subscription/route.ts`
- Modify: `components/billing/PortOneV1BillingCheckout.tsx`
- Test: `tests/billing-portone-kcp-v1.test.ts`
- Test: `tests/billing-worker-renewal.integration.test.ts`

**Interfaces:** access tokens are cached only until provider expiry; customer UID is server-generated and owner-bound; monthly job ID is deterministic by subscription and billing period.

- [ ] **Step 1: Write failing tests** for token refresh, billing-key registration, test charge/revoke, recurring charge, retryable decline, permanent decline, duplicate worker claim, cancel race, and past-due transition.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement KCP recurring setup and renewal** with encrypted billing reference, provider-side cancel/revoke, bounded retries, and a single entitlement period extension per successful provider payment.
- [ ] **Step 4: Run the KCP sandbox recurring test** and verify that test billing data is revoked.
- [ ] **Step 5: Run GREEN:** automated tests, typecheck, worker test, and PostgreSQL verifier.
- [ ] **Step 6: Commit:** `git commit -m "feat: complete KCP recurring billing"`.

---

### Task 8: Apply coupons, cancellation, refunds, and entitlement projection atomically

**Files:**
- Modify: `src/lib/billing/subscription.repository.ts`
- Modify: `src/lib/billing/effective-entitlement.ts`
- Modify: `src/lib/billing/billing-event.repository.ts`
- Modify: `src/lib/billing/billing-refund.repository.ts`
- Modify: `src/lib/coupons/coupon.repository.ts`
- Modify: `app/api/billing/domestic/cancel/route.ts`
- Modify: `app/api/admin/billing/refunds/route.ts`
- Modify: `app/api/billing/status/route.ts`
- Test: `tests/billing-entitlement-projection.test.ts`
- Test: `tests/billing-coupon-cancel-refund.test.ts`

**Interfaces:** entitlements project from append-only billing events; cancellation ends renewal at period end unless a verified immediate refund/revoke policy applies; coupon reservation commits only with the successful payment/subscription transaction.

- [ ] **Step 1: Write failing tests** for reservation expiry, duplicate redemption, Polar/domestic coupon compatibility, cancel at period end, renewal race, refund bounds, past-due grace, role override, and session invalidation.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement transactional projections** with a monotonic account entitlement version and invalidate cached/session access when it changes.
- [ ] **Step 4: Reconcile provider state** before refunds and expose safe operator errors with exact recovery steps.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck && npm.cmd run billing:verify-postgres`.
- [ ] **Step 6: Commit:** `git commit -m "feat: project billing lifecycle into access"`.

---

### Task 9: Finish customer and admin payment operations UI

**Files:**
- Modify: `components/billing/SubscriptionSettingsCard.tsx`
- Modify: `components/billing/DomesticCheckoutDialog.tsx`
- Modify: `components/Admin/AdminBillingPanel.tsx`
- Modify: `app/api/admin/billing/test/route.ts`
- Modify: `app/api/admin/billing/refunds/route.ts`
- Create: `app/api/admin/billing/webhooks/route.ts`
- Create: `app/api/admin/billing/workers/route.ts`
- Test: `tests/billing-customer-operations-ui.test.ts`
- Test: `tests/billing-admin-operations-ui.test.ts`

**Interfaces:** customer UI shows provider/environment, status, renewal date, cancellation, and exact failure resolution; admin UI shows readiness, worker heartbeat, webhook inbox, attempts, subscriptions, refunds, and sandbox test actions without secret values.

- [ ] **Step 1: Write failing UI/route tests** for loading/empty/error/success, live confirmation, keyboard/focus behavior, role checks, redaction, replay, refund limits, and worker-offline test blocking.
- [ ] **Step 2: Run RED:** `npm.cmd test`.
- [ ] **Step 3: Implement customer operations** including working Polar portal, domestic cancellation, retry/replace-payment guidance, and entitlement refresh.
- [ ] **Step 4: Implement admin operations** with provider readiness, one-time/recurring sandbox tests, webhook replay, reconciliation, refund, and audit display.
- [ ] **Step 5: Run GREEN:** `npm.cmd test && npm.cmd run typecheck && npm.cmd run build`.
- [ ] **Step 6: Commit:** `git commit -m "feat: finish billing operations screens"`.

---

### Task 10: Document Railway variables and execute the release matrix

**Files:**
- Create: `docs/railway-service-matrix.md`
- Modify: `docs/railway-portone-billing.md`
- Create: `docs/billing-release-evidence.schema.json`
- Create: `scripts/verify-railway-config.mjs`
- Create: `scripts/verify-billing-release-evidence.mjs`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/production-operations-release.test.ts`

- [ ] **Step 1: Write a failing release-contract test** that maps every variable to web, automation worker, billing worker, research worker, cron, or relay and rejects secret-looking documentation values.
- [ ] **Step 2: Run RED:** `npm.cmd test`.

Expected: FAIL because the service matrix, release-evidence schema, and verifiers do not exist.

- [ ] **Step 3: Document exact Railway configuration** for PostgreSQL, Valkey, public URLs, OAuth encryption, MFA keys, Firebase, Polar, PortOne V2, KCP V1, KPN, webhook URLs, worker versions, and health thresholds.
- [ ] **Step 4: Run GREEN with automated verification:**

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run postgres:verify-all
node scripts/verify-railway-config.mjs
node scripts/verify-billing-release-evidence.mjs
```

- [ ] **Step 5: Execute the sandbox matrix:** KPN one-time, KPN recurring issue/test/revoke, KCP recurring issue/test/revoke, duplicate webhook, delayed webhook, worker restart, cancellation, coupon, refund, and access refresh.
- [ ] **Step 6: Record live-readiness without charging:** credentials recognized, webhook endpoints reachable, merchant/channel/store match, workers healthy, and PostgreSQL migrations/constraints present.
- [ ] **Step 7: Commit:** `git commit -m "docs: verify Railway and domestic billing release"`.

## Completion Gate

- Web, automation, billing, research, cron, and relay services have distinct commands, health checks, and heartbeat evidence.
- Queue insertion refuses invalid credentials/scopes/adapters and queued stalls expose exact causes/resolutions.
- Real PostgreSQL concurrency, idempotency, fencing, and owner isolation pass in an isolated schema.
- KPN V2 one-time/recurring and KCP V1 recurring sandbox matrices pass with provider verification.
- Webhook inbox, payment attempts, subscriptions, coupons, cancellation, refunds, and entitlement projection are durable and auditable.
- Customer Polar/domestic operations and admin billing screens work without exposing secrets.
- Railway variable and release evidence verifiers pass; live charging remains separately operator-approved.
