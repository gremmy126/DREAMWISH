# Polar Entitlement and Durable Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polar 활성 구독 또는 서버 검증 관리자만 앱을 사용할 수 있게 하고, 새 메모리·지식을 PostgreSQL의 append-only owner 저장소에 보존한다.

**Architecture:** Firebase uid를 Polar external customer id와 owner key로 사용한다. Polar 서명 웹훅이 구독 권한의 정본이며, PostgreSQL owner document revision과 billing event 테이블이 재배포·중복 이벤트·동시 쓰기를 견딘다. JSON 저장소는 명시적 개발·테스트 경로에서만 사용하고 읽기 오류를 빈 값으로 숨기지 않는다.

**Tech Stack:** Next.js 15 Route Handlers, React 19, TypeScript, Firebase Auth, PostgreSQL via `postgres`, Polar Next.js SDK, Node test harness

## Global Constraints

- 관리자 기본 이메일은 `kara111131@naver.com`이며 서버에서 정규화해 판정한다.
- 일반 사용자는 Polar 활성 구독이 아니면 보호 API에서 402를 받는다.
- 과거 사라진 JSON 메모리는 복구하거나 자동 이관하지 않는다.
- 새 메모리·지식 revision은 물리 삭제하지 않는다.
- 비로그인 공개 AI Chat과 AdSense는 유지하고 로그인 작업 화면에는 광고를 표시하지 않는다.
- localStorage, Checkout 성공 URL, 클라이언트 이메일은 권한 근거가 아니다.

---

### Task 1: PostgreSQL append-only owner store

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/db/postgres.ts`
- Create: `src/lib/db/owner-document-store.ts`
- Test: `tests/durable-owner-store.test.ts`

**Interfaces:**
- Produces: `hasPostgresStorage(): boolean`
- Produces: `readOwnerDocument<T>(ownerId, namespace, fallback): Promise<T>`
- Produces: `mutateOwnerDocument<T, R>(ownerId, namespace, fallback, mutate): Promise<R>`

- [ ] **Step 1: Write the failing pure contract test**

```ts
test("durable owner store defines append-only owner revisions", () => {
  const source = fs.readFileSync("src/lib/db/owner-document-store.ts", "utf8");
  assert.match(source, /owner_id TEXT NOT NULL/u);
  assert.match(source, /namespace TEXT NOT NULL/u);
  assert.match(source, /revision BIGINT NOT NULL/u);
  assert.match(source, /payload JSONB NOT NULL/u);
  assert.match(source, /pg_advisory_xact_lock/u);
  assert.doesNotMatch(source, /DELETE FROM durable_owner_documents/u);
});
```

- [ ] **Step 2: Run the test suite and verify it fails because the store does not exist**

Run: `npm test`

Expected: FAIL at `durable owner store defines append-only owner revisions`.

- [ ] **Step 3: Install and implement the minimal store**

```ts
import postgres, { type Sql } from "postgres";

let client: Sql | null = null;
export function hasPostgresStorage() {
  return Boolean(process.env.DATABASE_URL?.trim());
}
export function getPostgres() {
  if (!hasPostgresStorage()) throw new Error("DATABASE_URL is required for durable storage.");
  client ??= postgres(process.env.DATABASE_URL!, { max: 5, idle_timeout: 20 });
  return client;
}
```

`mutateOwnerDocument` must open a transaction, call `pg_advisory_xact_lock(hashtext(ownerId || ':' || namespace))`, read the latest revision, pass a cloned payload to `mutate`, and insert revision `previous + 1`. It must never update or delete a previous revision.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/db/postgres.ts src/lib/db/owner-document-store.ts tests/durable-owner-store.test.ts
git commit -m "feat: add durable owner document storage"
```

### Task 2: Strict JSON error semantics and durable memory adapter

**Files:**
- Modify: `src/lib/local-db/json-store.ts`
- Modify: `src/lib/memory/memory-repository.ts`
- Test: `tests/durable-memory-storage.test.ts`
- Modify: `tests/memory-lifecycle.test.ts`

**Interfaces:**
- Consumes: `readOwnerDocument`, `mutateOwnerDocument`, `hasPostgresStorage`
- Preserves: existing memory repository function signatures

- [ ] **Step 1: Write failing tests for strict reads and production durability selection**

```ts
test("json store returns fallback only for a missing file", async () => {
  await assert.rejects(
    () => readJsonStore("broken.json", { rows: [] }),
    /Unexpected token|JSON/u
  );
});

test("memory repository selects postgres when DATABASE_URL is configured", () => {
  const source = fs.readFileSync("src/lib/memory/memory-repository.ts", "utf8");
  assert.match(source, /hasPostgresStorage\(\)/u);
  assert.match(source, /mutateOwnerDocument/u);
  assert.match(source, /memory-state/u);
});
```

- [ ] **Step 2: Run tests and verify both contracts fail**

Run: `npm test`

Expected: JSON parse error is swallowed and PostgreSQL adapter contract is absent.

- [ ] **Step 3: Restrict fallback and add the adapter**

```ts
export async function readJsonStore<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(getDataDirectory(), fileName);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}
```

For production memory, store each owner's normalized `MemoryDb` under namespace `memory-state`. Mutation helpers derive the owner from the candidate, memory, job, or preview argument and append a revision. `readMemoryDb()` merges owner documents only for server-internal legacy callers; route-facing functions continue filtering by owner.

- [ ] **Step 4: Run focused lifecycle and full verification**

Run: `npm test`

Expected: all memory lifecycle and strict error tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/local-db/json-store.ts src/lib/memory/memory-repository.ts tests/durable-memory-storage.test.ts tests/memory-lifecycle.test.ts
git commit -m "feat: persist memory revisions in postgres"
```

### Task 3: Billing repository and server entitlement

**Files:**
- Create: `src/lib/billing/billing.types.ts`
- Create: `src/lib/billing/billing.repository.ts`
- Create: `src/lib/auth/entitled-owner-context.ts`
- Modify: `src/lib/auth/access-control.ts`
- Modify: `src/lib/auth/account.repository.ts`
- Modify: `src/lib/auth/api-access-policy.ts`
- Modify: `src/lib/auth/session-token.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/session/route.ts`
- Test: `tests/polar-entitlement.test.ts`
- Modify: `tests/api-access-control.test.ts`

**Interfaces:**
- Produces: `getBillingEntitlement(ownerId): Promise<BillingEntitlement>`
- Produces: `applyPolarCustomerState(event): Promise<BillingEntitlement>`
- Produces: `requireEntitledOwnerContext(request): Promise<OwnerContext>`

- [ ] **Step 1: Write failing access-policy tests**

```ts
assert.deepEqual(decideApiAccess("/api/ai/chat", unpaid), {
  allowed: false,
  status: 402,
  code: "PAYMENT_REQUIRED"
});
assert.deepEqual(decideApiAccess("/api/ai/chat", admin), { allowed: true });
assert.equal(buildAccessState({ email: "member@example.com", paid: false }).canUseApp, false);
```

- [ ] **Step 2: Run tests and verify unpaid access currently passes incorrectly**

Run: `npm test`

Expected: FAIL because `canUseApp` and protected API access are currently unconditional.

- [ ] **Step 3: Implement server entitlement state**

```ts
export type BillingStatus = "none" | "checkout_pending" | "active" | "past_due" | "canceled" | "revoked";
export type BillingEntitlement = {
  ownerId: string;
  status: BillingStatus;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  updatedAt: string;
};
```

`buildAccessState` returns `canUseApp = adminBypass || paid`. `ADMIN_EMAILS` is split on commas, normalized, and falls back to `kara111131@naver.com`. The session routes look up entitlement by verified Firebase uid and sign a short-lived `paid` claim. `requireEntitledOwnerContext` rechecks current entitlement for state-changing routes so a stale cookie cannot preserve canceled access.

- [ ] **Step 4: Run security tests and typecheck**

Run: `npm test`

Expected: unpaid protected calls are 402, checkout/auth remain allowed, and admin remains allowed.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing src/lib/auth app/api/auth tests/polar-entitlement.test.ts tests/api-access-control.test.ts
git commit -m "feat: enforce Polar subscription entitlements"
```

### Task 4: Polar checkout, verified webhook, status, and portal

**Files:**
- Create: `src/lib/billing/polar.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/status/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/webhooks/polar/route.ts`
- Modify: `middleware.ts`
- Modify: `.env.example`
- Test: `tests/polar-routes.test.ts`

**Interfaces:**
- Checkout response: `{ checkoutUrl: string }`
- Status response: `{ access: AccessState; entitlement: BillingEntitlement }`
- Portal response: `{ portalUrl: string }`

- [ ] **Step 1: Write failing route security tests**

```ts
test("checkout ignores forged customer identity", async () => {
  const source = fs.readFileSync("app/api/billing/checkout/route.ts", "utf8");
  assert.match(source, /requireOwnerContext/u);
  assert.match(source, /externalCustomerId:\s*owner\.uid/u);
  assert.doesNotMatch(source, /body\.customerEmail|body\.externalCustomerId/u);
});

test("Polar webhook requires the official signature adapter", () => {
  const source = fs.readFileSync("app/api/webhooks/polar/route.ts", "utf8");
  assert.match(source, /Webhooks/u);
  assert.match(source, /POLAR_WEBHOOK_SECRET/u);
  assert.doesNotMatch(source, /if \(secret &&/u);
});
```

- [ ] **Step 2: Run tests and verify route files are absent**

Run: `npm test`

Expected: FAIL with missing Polar route files.

- [ ] **Step 3: Implement SDK routes**

Use `@polar-sh/nextjs` Webhooks for signature verification and `@polar-sh/sdk` for server-side Checkout/Customer Session creation. Checkout product id comes only from `POLAR_PRODUCT_ID`; external customer id and email come from the verified owner. Webhook event ids are stored before state application with a unique key; duplicate delivery returns success without applying state twice.

```ts
export const POST = Webhooks({
  webhookSecret: requireEnv("POLAR_WEBHOOK_SECRET"),
  onPayload: async (payload) => {
    await applyPolarWebhook(payload);
  }
});
```

- [ ] **Step 4: Run tests, typecheck, and build**

Run: `npm test`

Expected: all Polar route tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing app/api/billing app/api/webhooks/polar middleware.ts .env.example tests/polar-routes.test.ts
git commit -m "feat: integrate Polar checkout and webhooks"
```

### Task 5: Payment gate, sidebar upgrade, and refresh shell

**Files:**
- Create: `src/lib/auth/access-context.tsx`
- Create: `components/billing/PaymentGate.tsx`
- Create: `components/billing/UpgradeButton.tsx`
- Modify: `components/auth/AuthGate.tsx`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `app/billing/success/page.tsx`
- Modify: `src/lib/i18n/translations.ts`
- Test: `tests/billing-ui.test.ts`
- Modify: `tests/public-ai-home.test.ts`

**Interfaces:**
- Produces: `useAccess(): AccessState`
- Produces: `refreshAccess(): Promise<void>`

- [ ] **Step 1: Write failing UI contracts**

```ts
assert.match(sidebar, /<UpgradeButton/u);
assert.ok(sidebar.indexOf("<UpgradeButton") < sidebar.indexOf("<StorageStatus"));
assert.match(authGate, /if \(loading\)[\s\S]*SessionRestoreShell/u);
assert.doesNotMatch(authGate.slice(authGate.indexOf("if (loading)"), authGate.indexOf("if (!access)")), /GuestChatHome/u);
assert.match(paymentGate, /access\.requiresPayment/u);
```

- [ ] **Step 2: Run tests and verify missing gate and upgrade button**

Run: `npm test`

Expected: FAIL in billing UI contracts.

- [ ] **Step 3: Implement payment-aware app shell**

`AuthGate` provides access context after Firebase restoration. `AppShell` always renders the existing sidebar for authenticated users; `PaymentGate` replaces only the content area for unpaid users. `UpgradeButton` opens `/api/billing/checkout`, paid users open `/api/billing/portal`, and admins render no button. Billing success polls `/api/billing/status` until active or a bounded timeout, then navigates to `/` without granting local state.

- [ ] **Step 4: Run tests and visual build checks**

Run: `npm test`

Expected: UI contracts pass and public guest home remains crawlable.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/access-context.tsx components/billing components/auth/AuthGate.tsx components/layout app/billing/success/page.tsx src/lib/i18n/translations.ts tests/billing-ui.test.ts tests/public-ai-home.test.ts
git commit -m "feat: add subscription gate and sidebar upgrade"
```
