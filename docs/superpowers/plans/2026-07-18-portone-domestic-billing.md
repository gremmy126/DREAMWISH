# PortOne Domestic Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep existing Polar subscriptions working while adding public KPN V2 sandbox checkout, production KPN V2 monthly billing, and administrator-selectable NHN KCP V1 recurring billing through PortOne.

**Architecture:** Introduce a provider-neutral `BillingGateway` and append-only billing records around the existing entitlement boundary. PortOne browser SDKs collect payment authorization, but the server independently verifies provider ID, status, amount, currency, environment, and owner before changing entitlement or revenue. PostgreSQL stores attempts, methods, subscriptions, charge jobs, webhook inbox entries, and audit events; Polar remains an adapter for existing customers.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, PostgreSQL, `@portone/browser-sdk` V2, `@portone/server-sdk`, PortOne V1 browser SDK, Zod, existing coupon and entitlement domains, Node test runner through `npm.cmd test`.

## Global Constraints

- Existing Polar subscriptions remain on Polar and are never silently migrated.
- New domestic monthly subscriptions use KPN V2 by default; NHN KCP V1 is an administrator-selected fallback, not an automatic retry.
- General users do not choose or see PG vendor brands; they choose a payment method or subscription action.
- `BILLING_DOMESTIC_MODE=sandbox` and `BILLING_PUBLIC_SANDBOX_ENABLED=true` allow general-user test checkout from the sidebar.
- Sandbox success never creates production entitlement, confirmed revenue, refundable balance, or coupon consumption.
- `BILLING_DOMESTIC_MODE=live` and `BILLING_PUBLIC_SANDBOX_ENABLED=true` is an invalid configuration and disables domestic checkout.
- Card number, CVC, birth date, and card password digits are collected only inside provider-hosted payment UI and never traverse DREAMWISH APIs.
- Browser callbacks are untrusted signals. Entitlement changes require a server-to-server PortOne lookup and exact amount/currency/payment-ID comparison.
- V2 webhooks require signature verification; V1 webhook identifiers require V1 API re-query before use.
- Payment IDs, event keys, and charge jobs are idempotent. Failed KPN charges are never automatically retried through KCP.
- Refunds are administrator-only and follow the existing platform-error/duplicate-charge policy.
- Cancellation stops future charges and preserves access until the paid period end.
- Real secrets remain in Railway variables and never enter Git, public DTOs, logs, screenshots, tests, chat, or DLQ payloads.
- Write a failing test, prove RED, implement the smallest passing behavior, verify, review, and commit each task independently.
- `scripts/run-tests.mjs` always loads every `tests/*.test.ts` file, so every `npm.cmd test` RED/GREEN command runs the complete suite; a RED result is valid only when the newly added assertion fails for the expected missing behavior.
- Do not stage or modify the existing untracked `.claude/` directory.

## File Structure

### Core contracts and configuration

- Create `src/lib/billing/billing-gateway.types.ts`: provider-neutral attempts, methods, subscriptions, Gateway contract.
- Create `src/lib/billing/billing-config.ts`: strict Railway configuration and sandbox/live invariant.
- Create `src/lib/billing/billing-gateway.registry.ts`: Polar/KPN/KCP adapter selection without automatic cross-provider retry.
- Modify `src/lib/billing/billing.types.ts`: provider-neutral entitlement fields while retaining Polar compatibility fields.

### Persistence and workers

- Create `src/lib/billing/billing-schema.ts`: idempotent PostgreSQL schema.
- Create `src/lib/billing/payment-attempt.repository.ts`.
- Create `src/lib/billing/billing-method.repository.ts`.
- Create `src/lib/billing/subscription.repository.ts`.
- Create `src/lib/billing/billing-webhook.repository.ts`.
- Create `src/lib/billing/billing-charge-queue.repository.ts`.
- Create `src/lib/billing/billing-event.repository.ts`.
- Create `src/lib/billing/billing-worker.ts`.
- Create `scripts/run-billing-worker.mjs`.
- Create `railway.billing-worker.toml`.

### PortOne adapters

- Create `src/lib/billing/portone/portone-http.ts`: masked, timeout-bounded server HTTP.
- Create `src/lib/billing/portone/kpn-v2.adapter.ts`.
- Create `src/lib/billing/portone/kcp-v1.adapter.ts`.
- Create `src/lib/billing/portone/v1-access-token.ts`.
- Create `src/lib/billing/portone/v2-webhook.ts`.
- Create `src/types/portone-v1.d.ts`.

### Routes

- Create `app/api/billing/domestic/config/route.ts`.
- Create `app/api/billing/domestic/checkout/route.ts`.
- Create `app/api/billing/domestic/verify/route.ts`.
- Create `app/api/billing/domestic/billing-method/route.ts`.
- Create `app/api/billing/domestic/subscription/route.ts`.
- Create `app/api/billing/domestic/cancel/route.ts`.
- Create `app/api/webhooks/portone/v2/route.ts`.
- Create `app/api/webhooks/portone/v1/route.ts`.
- Create `app/api/admin/billing/providers/route.ts`.
- Create `app/api/admin/billing/test/route.ts`.

### UI

- Create `components/billing/DomesticCheckoutDialog.tsx`.
- Create `components/billing/PortOneV2Checkout.tsx`.
- Create `components/billing/PortOneV1BillingCheckout.tsx`.
- Create `components/Admin/AdminBillingPanel.tsx`.
- Modify `components/billing/UpgradeButton.tsx`.
- Modify `components/billing/SubscriptionSettingsCard.tsx`.
- Modify `components/layout/Sidebar.tsx`.
- Modify `components/Admin/AdminShell.tsx`.

### Entitlement, coupon, confirmed-payment events, policy

- Modify `src/lib/billing/billing.repository.ts`.
- Modify `src/lib/billing/effective-entitlement.ts`.
- Modify `src/lib/coupons/coupon.service.ts`.
- Modify `src/lib/coupons/coupon.repository.ts`.
- Modify `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/refunds/page.tsx`.

### Tests and docs

- Create `tests/billing-gateway-contract.test.ts`.
- Create `tests/billing-portone-kpn.test.ts`.
- Create `tests/billing-portone-kcp-v1.test.ts`.
- Create `tests/billing-portone-webhook.test.ts`.
- Create `tests/billing-public-sandbox.test.ts`.
- Create `tests/billing-subscription-lifecycle.test.ts`.
- Create `tests/billing-domestic-ui.test.ts`.
- Create `docs/railway-portone-billing.md`.
- Modify `.env.example`, `README.md`, `package.json`, and the package lock.

---

### Task 1: Define provider-neutral billing contracts and strict configuration

**Files:**
- Create: `src/lib/billing/billing-gateway.types.ts`
- Create: `src/lib/billing/billing-config.ts`
- Create: `src/lib/billing/billing-gateway.registry.ts`
- Modify: `src/lib/billing/billing.types.ts`
- Test: `tests/billing-gateway-contract.test.ts`

**Interfaces:**
- Produces: `BillingGateway`, `BillingProvider`, `BillingEnvironment`, `PaymentAttemptStatus`, `getDomesticBillingConfig`, `getBillingGateway`.
- Consumes: existing `BillingEntitlement`, Polar adapter helpers, environment variables from the approved spec.

- [ ] **Step 1: Write failing config and adapter-selection tests**

```ts
test("live mode refuses a public sandbox flag", () => {
  withEnv({ BILLING_DOMESTIC_MODE: "live", BILLING_PUBLIC_SANDBOX_ENABLED: "true" }, () => {
    assert.throws(() => getDomesticBillingConfig(), (error: unknown) =>
      isBillingError(error, "PAYMENT_MODE_CONFLICT")
    );
  });
});

test("KPN is primary and KCP is not an automatic retry", () => {
  const config = configFixture({ primaryProvider: "portone_kpn_v2", fallbackProvider: "portone_kcp_v1" });
  assert.equal(getBillingGateway(config, "new_subscription").provider, "portone_kpn_v2");
  assert.equal(config.allowAutomaticCrossProviderRetry, false);
});
```

- [ ] **Step 2: Run the focused test to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the provider-neutral contract and strict config do not exist.

- [ ] **Step 3: Add exact shared types**

```ts
export type BillingProvider = "polar" | "portone_kpn_v2" | "portone_kcp_v1";
export type BillingEnvironment = "sandbox" | "live";
export type PaymentPurpose = "general" | "subscription_setup" | "subscription_charge";
export type PaymentAttemptStatus =
  | "created"
  | "pending_provider"
  | "verification_pending"
  | "test_succeeded"
  | "succeeded"
  | "failed"
  | "expired";

export interface BillingGateway {
  readonly provider: BillingProvider;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  issueBillingMethod(input: IssueBillingMethodInput): Promise<BillingMethodResult>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment>;
}
```

- [ ] **Step 4: Implement fail-closed configuration parsing**

Use Zod to parse mode, booleans, provider IDs, Store ID, Channel Keys, API credentials, and webhook secrets. Return a safe readiness object that contains only booleans and missing variable names. Never return values.

```ts
if (mode === "live" && publicSandboxEnabled) {
  throw new BillingConfigurationError(
    "PAYMENT_MODE_CONFLICT",
    "Public sandbox checkout cannot run in live mode."
  );
}
```

- [ ] **Step 5: Run focused tests and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: tests pass and existing Polar types compile with additive provider-neutral fields.

- [ ] **Step 6: Commit the billing contract**

```powershell
git add -- src/lib/billing/billing-gateway.types.ts src/lib/billing/billing-config.ts src/lib/billing/billing-gateway.registry.ts src/lib/billing/billing.types.ts tests/billing-gateway-contract.test.ts
git commit -m "feat: define domestic billing gateway"
```

---

### Task 2: Persist payment attempts, billing methods, subscriptions, jobs, and events

**Files:**
- Create: `src/lib/billing/billing-schema.ts`
- Create: `src/lib/billing/payment-attempt.repository.ts`
- Create: `src/lib/billing/billing-method.repository.ts`
- Create: `src/lib/billing/subscription.repository.ts`
- Create: `src/lib/billing/billing-webhook.repository.ts`
- Create: `src/lib/billing/billing-charge-queue.repository.ts`
- Create: `src/lib/billing/billing-event.repository.ts`
- Test: `tests/billing-subscription-lifecycle.test.ts`

**Interfaces:**
- Produces: owner-scoped create/get/transition functions, `claimDueBillingJobs`, `completeBillingJob`, `deadLetterBillingJob`, append-only `appendBillingEvent`.
- Consumes: `BillingProvider`, `BillingEnvironment`, `PaymentAttemptStatus`, existing PostgreSQL and JSON-store helpers.

- [ ] **Step 1: Write failing state, idempotency, lease, and secret-masking tests**

```ts
test("payment attempt idempotency returns the original row", async () => {
  const first = await createPaymentAttempt(attemptInput({ idempotencyKey: "owner:period:1" }));
  const second = await createPaymentAttempt(attemptInput({ idempotencyKey: "owner:period:1" }));
  assert.equal(second.id, first.id);
});

test("sandbox success cannot become production entitlement", async () => {
  const attempt = await transitionPaymentAttempt(id, "test_succeeded", verificationFixture());
  assert.equal(attempt.environment, "sandbox");
  assert.equal(await getEntitlementFromAttempt(attempt.id), null);
});

test("only one worker leases a due charge job", async () => {
  const [a, b] = await Promise.all([claimDueBillingJobs("worker-a", 1), claimDueBillingJobs("worker-b", 1)]);
  assert.equal(a.length + b.length, 1);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the billing persistence modules do not exist.

- [ ] **Step 3: Create idempotent PostgreSQL schema**

Create the approved logical tables with owner/provider/environment indexes and constraints:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS billing_payment_attempts_idempotency_idx
  ON billing_payment_attempts(provider, environment, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS billing_webhook_inbox_event_idx
  ON billing_webhook_inbox(provider, environment, event_key);
CREATE INDEX IF NOT EXISTS billing_charge_jobs_due_idx
  ON billing_charge_jobs(status, next_run_at, priority DESC);
```

`billing_events` has no UPDATE or DELETE repository method. Billing references and safe card metadata live separately; raw card fields are absent from every schema.

- [ ] **Step 4: Implement explicit transition tables and lease claims**

```ts
const PAYMENT_TRANSITIONS: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  created: ["pending_provider", "failed", "expired"],
  pending_provider: ["verification_pending", "failed", "expired"],
  verification_pending: ["test_succeeded", "succeeded", "failed"],
  test_succeeded: [],
  succeeded: [],
  failed: [],
  expired: []
};
```

Lease with `FOR UPDATE SKIP LOCKED`, set `locked_until`, and compare the job version when completing. Encrypt provider billing references before storage.

- [ ] **Step 5: Run lifecycle tests and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: idempotency, immutable terminal states, owner isolation, sandbox invariants, and lease tests pass.

- [ ] **Step 6: Commit durable billing state**

```powershell
git add -- src/lib/billing/billing-schema.ts src/lib/billing/payment-attempt.repository.ts src/lib/billing/billing-method.repository.ts src/lib/billing/subscription.repository.ts src/lib/billing/billing-webhook.repository.ts src/lib/billing/billing-charge-queue.repository.ts src/lib/billing/billing-event.repository.ts tests/billing-subscription-lifecycle.test.ts
git commit -m "feat: persist domestic billing state"
```

---

### Task 3: Implement the KPN V2 server adapter and signed webhook verifier

**Files:**
- Modify: `package.json`
- Modify: package lock
- Create: `src/lib/billing/portone/portone-http.ts`
- Create: `src/lib/billing/portone/kpn-v2.adapter.ts`
- Create: `src/lib/billing/portone/v2-webhook.ts`
- Test: `tests/billing-portone-kpn.test.ts`
- Test: `tests/billing-portone-webhook.test.ts`

**Interfaces:**
- Produces: `PortOneKpnV2Adapter`, `verifyPortOneV2Webhook`, timeout-bounded `portOneV2Request`.
- Consumes: V2 Store ID, API Secret, environment-selected KPN Channel Keys, `BillingGateway`.

- [ ] **Step 1: Install official PortOne SDKs**

Run: `npm.cmd install @portone/browser-sdk @portone/server-sdk`

Expected: `package.json` and lock file contain both dependencies; install exits 0.

- [ ] **Step 2: Write failing server adapter tests with a local fetch stub**

```ts
test("KPN verification rejects an amount mismatch", async () => {
  mockPortOnePayment({ id: "testpayment1", status: "PAID", amount: { total: 9900 }, currency: "KRW" });
  await assert.rejects(
    () => adapter.verifyPayment({ providerPaymentId: "testpayment1", expectedAmount: 10000, currency: "KRW" }),
    (error: unknown) => isBillingError(error, "PAYMENT_AMOUNT_MISMATCH")
  );
});

test("KPN server requests use PortOne authorization without logging the secret", async () => {
  await adapter.verifyPayment(validInput);
  assert.equal(capturedHeaders.authorization, "PortOne test-api-secret");
  assert.doesNotMatch(capturedLogOutput, /test-api-secret/u);
});
```

- [ ] **Step 3: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the KPN adapter and webhook verifier do not exist.

- [ ] **Step 4: Implement the V2 HTTP boundary and KPN Adapter**

Use `Authorization: PortOne ${apiSecret}`, an abort timeout, JSON size limits, safe response parsing, and allow only `https://api.portone.io`. Implement:

```ts
class PortOneKpnV2Adapter implements BillingGateway {
  readonly provider = "portone_kpn_v2" as const;
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  issueBillingMethod(input: IssueBillingMethodInput): Promise<BillingMethodResult>;
  charge(input: ChargeInput): Promise<ChargeResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelResult>;
  verifyPayment(input: VerifyPaymentInput): Promise<VerifiedPayment>;
}
```

Payment IDs contain only ASCII letters and digits because KPN documents that restriction. `charge` calls `/payments/{paymentId}/billing-key`; scheduling uses the V2 payment schedule endpoint. Never implement direct card credential parameters.

- [ ] **Step 5: Verify V2 webhook signatures before parsing events**

Use `@portone/server-sdk` with the environment-selected secret. Return `WEBHOOK_SIGNATURE_INVALID` on mismatch. Pass only normalized event type, payment ID, event ID, environment, and occurrence time to the common processor.

- [ ] **Step 6: Run KPN/webhook tests and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: exact amount/currency/status checks pass; invalid signatures never create Inbox rows.

- [ ] **Step 7: Commit the KPN server boundary**

```powershell
git add -- package.json package-lock.json src/lib/billing/portone/portone-http.ts src/lib/billing/portone/kpn-v2.adapter.ts src/lib/billing/portone/v2-webhook.ts tests/billing-portone-kpn.test.ts tests/billing-portone-webhook.test.ts
git commit -m "feat: add portone kpn billing adapter"
```

---

### Task 4: Add public KPN sandbox general checkout with server verification

**Files:**
- Create: `app/api/billing/domestic/config/route.ts`
- Create: `app/api/billing/domestic/checkout/route.ts`
- Create: `app/api/billing/domestic/verify/route.ts`
- Create: `components/billing/PortOneV2Checkout.tsx`
- Create: `components/billing/DomesticCheckoutDialog.tsx`
- Modify: `components/billing/UpgradeButton.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Test: `tests/billing-public-sandbox.test.ts`
- Test: `tests/billing-domestic-ui.test.ts`

**Interfaces:**
- Consumes: KPN config, payment-attempt repository, `PortOne.requestPayment`.
- Produces: owner-scoped checkout creation/verification and public Sandbox UI.

- [ ] **Step 1: Write failing public Sandbox invariant tests**

```ts
test("public sandbox checkout creates a test attempt but no entitlement", async () => {
  const created = await POST(checkoutRequest({ purpose: "general", amount: 1000 }));
  const payload = await created.json();
  assert.equal(payload.environment, "sandbox");
  await verifyProviderSuccess(payload.attemptId);
  assert.equal((await getPaymentAttempt(payload.attemptId))?.status, "test_succeeded");
  assert.equal((await getBillingEntitlement("owner-1")).status, "none");
});

test("live mode never returns test channel configuration", async () => {
  await assert.rejects(() => getPublicDomesticConfig(liveConflictEnv), /PAYMENT_MODE_CONFLICT/u);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because domestic routes and UI do not exist.

- [ ] **Step 3: Implement server-owned checkout creation**

Do not accept amount, currency, product name, provider, or environment as authoritative client input. Resolve the approved test SKU and amount on the server. Return only:

```ts
type PublicDomesticCheckout = {
  attemptId: string;
  paymentId: string;
  storeId: string;
  channelKey: string;
  orderName: string;
  totalAmount: number;
  currency: "KRW";
  payMethod: "CARD";
  environment: "sandbox";
};
```

- [ ] **Step 4: Implement browser checkout and verification**

Call `PortOne.requestPayment` with the server response. Send only `attemptId` and provider payment ID to `/verify`; the server reloads every expected value and queries PortOne. Display `테스트 결제 - 실제 청구 및 구독 활성화 없음` before and after checkout.

- [ ] **Step 5: Run public Sandbox tests, lint, and typecheck**

Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

Expected: public Sandbox succeeds without entitlement/coupon/revenue mutation, keyboard Escape closes the dialog, focus returns, and controls are at least 44px.

- [ ] **Step 6: Commit public Sandbox checkout**

```powershell
git add -- app/api/billing/domestic/config/route.ts app/api/billing/domestic/checkout/route.ts app/api/billing/domestic/verify/route.ts components/billing/PortOneV2Checkout.tsx components/billing/DomesticCheckoutDialog.tsx components/billing/UpgradeButton.tsx components/layout/Sidebar.tsx tests/billing-public-sandbox.test.ts tests/billing-domestic-ui.test.ts
git commit -m "feat: add public domestic sandbox checkout"
```

---

### Task 5: Add KPN billing-method issuance and durable monthly charging

**Files:**
- Create: `app/api/billing/domestic/billing-method/route.ts`
- Create: `app/api/billing/domestic/subscription/route.ts`
- Create: `src/lib/billing/billing-worker.ts`
- Create: `scripts/run-billing-worker.mjs`
- Create: `railway.billing-worker.toml`
- Modify: `components/billing/PortOneV2Checkout.tsx`
- Modify: `components/billing/DomesticCheckoutDialog.tsx`
- Test: `tests/billing-subscription-lifecycle.test.ts`
- Test: `tests/billing-portone-kpn.test.ts`

**Interfaces:**
- Consumes: `PortOne.requestIssueBillingKey`, encrypted billing-method repository, charge-job lease, KPN Adapter.
- Produces: KPN monthly subscription setup, one initial verified charge, and one next-period durable job.

- [ ] **Step 1: Write failing billing-method and scheduling tests**

```ts
test("KPN subscription stores an encrypted billing reference and schedules one next charge", async () => {
  const result = await activateKpnSubscription(validVerifiedBillingKeyInput);
  assert.equal(result.subscription.provider, "portone_kpn_v2");
  assert.equal(result.subscription.environment, "live");
  assert.equal((await listDueJobs()).length, 1);
  assert.doesNotMatch(JSON.stringify(await publicSubscription(result.subscription.id)), /billing-key-/u);
});

test("charge completion creates exactly one following period job", async () => {
  await runBillingJob(job.id);
  assert.equal((await listJobsForSubscription(subscription.id)).filter(isFuturePending).length, 1);
});

test("public Sandbox recurring test creates no subscription, future job, or entitlement", async () => {
  const result = await runSandboxRecurringTest(validSandboxBillingKeyInput);
  assert.equal(result.attempt.status, "test_succeeded");
  assert.equal(await getSubscriptionByOwner("owner-1"), null);
  assert.equal((await listJobsForOwner("owner-1")).length, 0);
  assert.equal((await getBillingEntitlement("owner-1")).status, "none");
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because subscription setup and billing Worker do not exist.

- [ ] **Step 3: Implement hosted billing-key issuance flow**

The Sandbox dialog exposes `일반 결제 테스트` and `정기결제 테스트` choices without exposing the KPN vendor name. The server creates an immutable setup attempt and returns Store ID, billing Channel Key, unique issue ID, owner customer ID, full name, and Sandbox/live environment. The browser calls `requestIssueBillingKey`. The returned billing reference is sent over authenticated HTTPS, verified with PortOne where available, encrypted, and never returned again. In Sandbox, perform one explicitly labeled test charge, mark the attempt `test_succeeded`, then revoke or deactivate the test billing reference; do not create a subscription, future charge Job, Entitlement, confirmed-payment event, or coupon consumption.

- [ ] **Step 4: Implement the billing Worker**

```ts
export async function runBillingWorkerOnce(input: {
  workerId: string;
  now?: Date;
  limit?: number;
}) {
  const jobs = await claimDueBillingJobs(input.workerId, input.limit ?? 10, input.now ?? new Date());
  for (const job of jobs) await processClaimedBillingJob(job, input.workerId);
  return jobs.length;
}
```

Verify subscription status and idempotency before every charge. Mark failure/past-due without trying KCP. On verified success, advance the period and enqueue one next charge.

- [ ] **Step 5: Add Railway worker lifecycle**

`scripts/run-billing-worker.mjs` starts a loop, handles SIGTERM/SIGINT, and writes Worker state. `railway.billing-worker.toml` uses the same build command, `npm run billing:worker`, no web `PORT` health check, and restart-on-failure. Add `billing:worker` to `package.json`.

- [ ] **Step 6: Run lifecycle tests and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: duplicate Worker claims, duplicate charges, and automatic cross-provider retry tests pass.

- [ ] **Step 7: Commit recurring KPN billing**

```powershell
git add -- app/api/billing/domestic/billing-method/route.ts app/api/billing/domestic/subscription/route.ts src/lib/billing/billing-worker.ts scripts/run-billing-worker.mjs railway.billing-worker.toml components/billing/PortOneV2Checkout.tsx components/billing/DomesticCheckoutDialog.tsx package.json tests/billing-subscription-lifecycle.test.ts tests/billing-portone-kpn.test.ts
git commit -m "feat: add kpn recurring subscriptions"
```

---

### Task 6: Implement administrator-selectable NHN KCP V1 recurring billing

**Files:**
- Create: `src/lib/billing/portone/v1-access-token.ts`
- Create: `src/lib/billing/portone/kcp-v1.adapter.ts`
- Create: `src/types/portone-v1.d.ts`
- Create: `components/billing/PortOneV1BillingCheckout.tsx`
- Create: `app/api/admin/billing/providers/route.ts`
- Create: `app/api/admin/billing/test/route.ts`
- Test: `tests/billing-portone-kcp-v1.test.ts`

**Interfaces:**
- Produces: `PortOneKcpV1Adapter`, short-lived V1 API access-token cache, admin provider readiness/selection, KCP Sandbox test.
- Consumes: V1 IMP code, API Key/Secret, environment-selected KCP Channel Key, `BillingGateway`.

- [ ] **Step 1: Write failing KCP V1 contract and no-fallback tests**

```ts
test("KCP billing-key issuance uses channelKey and customer_uid", () => {
  const request = buildKcpBillingKeyRequest(input);
  assert.equal(request.channelKey, "channel-key-test");
  assert.equal(request.pay_method, "card");
  assert.equal(request.amount, 0);
  assert.equal(request.customer_uid, "customerowner1method1");
  assert.equal("pg" in request, false);
});

test("KPN failure does not invoke KCP without an administrator provider switch", async () => {
  await assert.rejects(() => runCharge(kpnFailureJob));
  assert.equal(kcpFetchCalls.length, 0);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the KCP V1 adapter does not exist.

- [ ] **Step 3: Add V1 SDK types and hosted billing-key request**

Load `https://cdn.iamport.kr/v1/iamport.js` once. Initialize with `PORTONE_V1_IMP_CODE` returned by the authenticated public-config route. Use `IMP.request_pay` with `channelKey`, `pay_method: "card"`, unique `merchant_uid`, `amount: 0`, `customer_uid`, buyer fields, and mobile `m_redirect_url`. Do not use deprecated `pg`.

- [ ] **Step 4: Implement server V1 authentication and recurring calls**

Get an access token from `/users/getToken` with the server-only V1 key/secret. Call `/subscribe/payments/again` for charges and `/subscribe/payments/schedule` for scheduled charges. Re-query `/payments/{imp_uid}` before accepting success. Cache access tokens only until their provider expiry and never log them.

- [ ] **Step 5: Add administrator readiness and explicit provider switch**

The admin route returns missing variable names and booleans, never values. Switching the primary provider appends a billing audit event and applies only to new subscriptions; existing subscription provider never changes implicitly.

- [ ] **Step 6: Run KCP and Gateway tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: hosted V1 issuance, token masking, provider re-query, and no automatic fallback tests pass.

- [ ] **Step 7: Commit KCP V1 billing**

```powershell
git add -- src/lib/billing/portone/v1-access-token.ts src/lib/billing/portone/kcp-v1.adapter.ts src/types/portone-v1.d.ts components/billing/PortOneV1BillingCheckout.tsx app/api/admin/billing/providers/route.ts app/api/admin/billing/test/route.ts tests/billing-portone-kcp-v1.test.ts
git commit -m "feat: add portone kcp v1 recurring billing"
```

---

### Task 7: Process PortOne V1/V2 webhooks through an idempotent Inbox

**Files:**
- Create: `app/api/webhooks/portone/v2/route.ts`
- Create: `app/api/webhooks/portone/v1/route.ts`
- Modify: `src/lib/billing/billing-webhook.repository.ts`
- Modify: `src/lib/billing/payment-attempt.repository.ts`
- Test: `tests/billing-portone-webhook.test.ts`

**Interfaces:**
- Consumes: `verifyPortOneV2Webhook`, KPN/KCP `verifyPayment`, Webhook Inbox repository.
- Produces: one common normalized event processor with exact-once state effects.

- [ ] **Step 1: Add failing invalid-signature, duplicate, and V1 re-query tests**

```ts
test("invalid V2 signature creates no inbox event", async () => {
  const response = await POST_V2(requestWithSignature("invalid"));
  assert.equal(response.status, 400);
  assert.equal((await listWebhookInbox()).length, 0);
});

test("duplicate V1 webhook re-queries once but applies entitlement once", async () => {
  await Promise.all([POST_V1(v1Webhook), POST_V1(v1Webhook)]);
  assert.equal((await listBillingEvents("payment_succeeded")).length, 1);
});
```

- [ ] **Step 2: Run focused test to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the PortOne routes do not exist.

- [ ] **Step 3: Implement normalized Inbox processing**

```ts
type NormalizedBillingWebhook = {
  provider: "portone_kpn_v2" | "portone_kcp_v1";
  environment: BillingEnvironment;
  eventKey: string;
  providerPaymentId: string;
  occurredAt: string;
};
```

Insert the Inbox event before processing with a unique provider/environment/event key. V2 verifies signature first. V1 re-queries the payment before deriving status. Transactionally apply the attempt transition, Entitlement event, revenue event, and Inbox completion.

- [ ] **Step 4: Run webhook and lifecycle tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: invalid, duplicate, reordered, and restart-retried events preserve one state effect.

- [ ] **Step 5: Commit webhook processing**

```powershell
git add -- app/api/webhooks/portone/v2/route.ts app/api/webhooks/portone/v1/route.ts src/lib/billing/billing-webhook.repository.ts src/lib/billing/payment-attempt.repository.ts tests/billing-portone-webhook.test.ts
git commit -m "feat: process portone billing webhooks"
```

---

### Task 8: Unify Entitlement, coupons, cancellation, and confirmed-payment events

**Files:**
- Modify: `src/lib/billing/billing.types.ts`
- Modify: `src/lib/billing/billing.repository.ts`
- Modify: `src/lib/billing/effective-entitlement.ts`
- Modify: `src/lib/coupons/coupon.service.ts`
- Modify: `src/lib/coupons/coupon.repository.ts`
- Create: `app/api/billing/domestic/cancel/route.ts`
- Modify: `components/billing/SubscriptionSettingsCard.tsx`
- Test: `tests/billing-subscription-lifecycle.test.ts`
- Test: `tests/coupon-domain.test.ts`

**Interfaces:**
- Consumes: verified production payment event, existing Polar entitlement, and access-duration coupon grants.
- Produces: provider-neutral active Entitlement, provider-aware cancellation, discount reservation, and an append-only confirmed-payment event for the later Revenue phase.

- [ ] **Step 1: Add failing mixed-provider and Sandbox-invariant tests**

```ts
test("existing Polar entitlement remains active after PortOne schema migration", async () => {
  const entitlement = normalizeEntitlement(legacyPolarFixture);
  assert.equal(entitlement.provider, "polar");
  assert.equal(entitlement.status, "active");
});

test("only verified live PortOne success creates entitlement and a confirmed-payment event", async () => {
  await applyVerifiedPayment(livePaidAttempt);
  await applyVerifiedPayment(sandboxPaidAttempt);
  assert.equal((await getBillingEntitlement("live-owner")).status, "active");
  assert.equal((await getBillingEntitlement("sandbox-owner")).status, "none");
  assert.equal((await listBillingEvents("payment_confirmed")).length, 1);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because Entitlement is Polar-specific and PortOne coupon/confirmed-payment invariants are absent.

- [ ] **Step 3: Add provider-neutral Entitlement compatibility**

```ts
export type BillingEntitlement = {
  ownerId: string;
  provider: BillingProvider | null;
  environment: BillingEnvironment | null;
  status: BillingStatus;
  customerId: string | null;
  subscriptionId: string | null;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endsAt: string | null;
  lastEventId: string | null;
  lastEventAt: string | null;
  updatedAt: string;
};
```

Normalize existing rows with Polar identifiers to `provider: "polar"`. Do not change current access decisions.

- [ ] **Step 4: Implement coupon reservation and cancellation**

Discount coupons reserve before checkout, consume after verified live success, and release after failure/expiry. Sandbox attempts never consume. Access-duration coupons remain PG-independent. Domestic cancellation marks `cancelAtPeriodEnd`, cancels pending provider schedules, and leaves Entitlement active until period end.

- [ ] **Step 5: Emit an append-only confirmed-payment event**

Use provider payment ID as the event idempotency key. Store owner ID, provider, amount, currency, paid time, and safe order label in `billing_events`. Do not emit Sandbox attempts. The later Revenue phase consumes this event and owns Business totals, so Billing does not create a second revenue store.

- [ ] **Step 6: Run billing and coupon tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: Polar compatibility, PortOne Entitlement, cancellation, coupon, and confirmed-payment event invariants pass.

- [ ] **Step 7: Commit entitlement integration**

```powershell
git add -- src/lib/billing/billing.types.ts src/lib/billing/billing.repository.ts src/lib/billing/effective-entitlement.ts src/lib/coupons/coupon.service.ts src/lib/coupons/coupon.repository.ts src/lib/billing/billing-event.repository.ts app/api/billing/domestic/cancel/route.ts components/billing/SubscriptionSettingsCard.tsx tests/billing-subscription-lifecycle.test.ts tests/coupon-domain.test.ts
git commit -m "feat: apply portone subscription entitlements"
```

---

### Task 9: Add administrator billing operations and provider-aware customer UI

**Files:**
- Create: `components/Admin/AdminBillingPanel.tsx`
- Modify: `components/Admin/AdminShell.tsx`
- Modify: `app/api/admin/system/status/route.ts`
- Modify: `components/billing/SubscriptionSettingsCard.tsx`
- Modify: `app/billing/success/page.tsx`
- Modify: `app/privacy/page.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `app/refunds/page.tsx`
- Test: `tests/billing-domestic-ui.test.ts`
- Test: `tests/admin-workspace.test.ts`

**Interfaces:**
- Consumes: safe provider readiness DTO, public Entitlement provider, admin provider/test routes.
- Produces: provider health/test/selection UI, provider-aware cancellation, accurate legal disclosures.

- [ ] **Step 1: Write failing UI and policy contract tests**

```ts
test("admin billing panel shows readiness without environment values", () => {
  const source = read("components/Admin/AdminBillingPanel.tsx");
  assert.match(source, /missingVariables/u);
  assert.match(source, /KPN/u);
  assert.match(source, /NHN KCP/u);
  assert.doesNotMatch(source, /process\.env/u);
});

test("customer billing UI does not force every provider through Polar portal", () => {
  const source = read("components/billing/SubscriptionSettingsCard.tsx");
  assert.match(source, /entitlement\.provider/u);
  assert.match(source, /\/api\/billing\/domestic\/cancel/u);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because admin billing operations and provider-aware UI do not exist.

- [ ] **Step 3: Implement administrator billing panel**

Show KPN general/billing Channel readiness, KCP V1 billing readiness, V2/V1 API readiness, test/live Webhook readiness, current default for new subscriptions, recent sanitized attempts, and explicit Sandbox test actions. Provider switch requires an admin confirmation dialog and never changes existing subscriptions.

- [ ] **Step 4: Make customer settings provider-aware**

Polar subscriptions keep the Polar portal. KPN/KCP subscriptions use the domestic cancellation endpoint and show paid-through date. Sandbox attempts display in a separate test history block and never use active-subscription badges.

- [ ] **Step 5: Update legal policy text**

Add PortOne, KPN, and NHN KCP processing and overseas/domestic data-processing facts as applicable; retain Polar for existing subscriptions. Keep the already approved no-refund-except-platform-error, duplicate-charge, legal-right, and cancellation language. State that card details are processed by payment providers and not stored by DREAMWISH.

- [ ] **Step 6: Run UI, policy, lint, and type tests**

Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

Expected: tests pass, dialogs support Escape/focus return, and no test payment is presented as a live subscription.

- [ ] **Step 7: Commit UI and policy integration**

```powershell
git add -- components/Admin/AdminBillingPanel.tsx components/Admin/AdminShell.tsx app/api/admin/system/status/route.ts components/billing/SubscriptionSettingsCard.tsx app/billing/success/page.tsx app/privacy/page.tsx app/terms/page.tsx app/refunds/page.tsx tests/billing-domestic-ui.test.ts tests/admin-workspace.test.ts tests/legal-policy-pages.test.ts
git commit -m "feat: add domestic billing operations"
```

---

### Task 10: Document Railway keys and run complete billing verification

**Files:**
- Create: `docs/railway-portone-billing.md`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `package.json`
- Modify: package lock
- Test: `tests/billing-gateway-contract.test.ts`
- Test: `tests/billing-public-sandbox.test.ts`

**Interfaces:**
- Consumes: all prior Billing tasks.
- Produces: exact operator setup guide, deployment configs, and final verification evidence.

- [ ] **Step 1: Add failing Railway-variable documentation tests**

```ts
test("PortOne Railway guide lists every required variable and source", () => {
  const guide = read("docs/railway-portone-billing.md");
  for (const name of [
    "BILLING_DOMESTIC_MODE",
    "BILLING_PUBLIC_SANDBOX_ENABLED",
    "PORTONE_V2_STORE_ID",
    "PORTONE_V2_API_SECRET",
    "PORTONE_KPN_TEST_GENERAL_CHANNEL_KEY",
    "PORTONE_KPN_TEST_BILLING_CHANNEL_KEY",
    "PORTONE_V2_WEBHOOK_SECRET_TEST",
    "PORTONE_V1_IMP_CODE",
    "PORTONE_V1_API_KEY",
    "PORTONE_V1_API_SECRET",
    "PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY"
  ]) assert.match(guide, new RegExp(name, "u"));
  assert.doesNotMatch(guide, /PortOne [A-Za-z0-9_-]{20,}|imp_secret\s*=\s*[A-Za-z0-9]/u);
});
```

- [ ] **Step 2: Run documentation test to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the Railway PortOne guide and `.env.example` variables are absent.

- [ ] **Step 3: Write exact Sandbox-to-live deployment instructions**

Document where each value is obtained in PortOne Console, test/live Channel separation, KPN billing contract prerequisite, V1 IMP/API identification, V2 Webhook secret issuance, Callback/Webhook URLs, Railway web/Billing Worker shared variables, and a safe readiness checklist. Use empty or obviously synthetic values only.

- [ ] **Step 4: Run complete web verification**

Run: `npm.cmd run lint`

Expected: exit 0.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd test`

Expected: every test passes.

Run: `npm.cmd run build`

Expected: Next.js production build exits 0.

- [ ] **Step 5: Run Worker and secret inspections**

Run: `node scripts/run-billing-worker.mjs --once`

Expected: with no due jobs, exits 0 after reporting a sanitized zero-job result; with missing production config, exits nonzero with only missing variable names.

Run: `rg -n "PORTONE_|billing-key-|customer_uid|imp_secret|card_number|passwordTwoDigits|CVC" app src components docs .env.example railway.billing-worker.toml`

Expected: only configuration names, encrypted-reference handling, provider contract field names in adapter code, and synthetic test fixtures appear; no real values or DreamWish card-input UI exists.

- [ ] **Step 6: Run real Sandbox evidence only when keys are present**

Run the general-user KPN Sandbox checkout, KPN Sandbox billing-key setup/charge, admin KCP V1 Sandbox billing setup/charge, and V2/V1 Webhook callbacks. Record provider payment IDs in the private operator checklist, not Git. If keys/contracts are absent, report these as externally blocked rather than passed.

- [ ] **Step 7: Commit docs and final billing fixes**

```powershell
git add -- docs/railway-portone-billing.md .env.example README.md package.json package-lock.json tests/billing-gateway-contract.test.ts tests/billing-public-sandbox.test.ts railway.billing-worker.toml
git commit -m "docs: add portone railway setup"
```

## Final Evidence

Before declaring Billing complete, report:

- exact commit range and changed files;
- lint/typecheck/test/build results;
- Billing Worker one-shot/lease results;
- Sandbox KPN general and recurring evidence;
- Sandbox KCP V1 recurring evidence;
- V2 signature and V1 re-query Webhook evidence;
- Polar regression evidence;
- proof that Sandbox did not create Entitlement, confirmed revenue, refund balance, or coupon consumption;
- external KPN contract, PortOne Channel, Railway variable, macOS/device, or production-review steps still owned by the user.
