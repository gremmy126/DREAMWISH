# DREAMWISH Admin, Coupons, Social Auth, and Automation Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-protected DREAMWISH administrator workspace, access-pass and Polar-discount coupons, Kakao/Naver login, and a complete Registry-driven automation guide with usable output mapping.

**Architecture:** Extend the existing signed-session and repository patterns. PostgreSQL is the production source for operational identities, coupons, grants, and OAuth state, with the existing local JSON store as a development fallback. Admin APIs are protected twice (middleware and route-level role checks), OAuth uses server-side authorization-code exchange, and the final enriched `ActionDefinition` remains the single guide and execution contract.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, PostgreSQL via `postgres`, Firebase email/password auth, Kakao/Naver REST OAuth, Polar SDK, Tailwind CSS, Node test harness.

## Global Constraints

- Work directly on the user-selected `main` branch; do not push until every verification command succeeds.
- Preserve the existing DREAMWISH colors, typography, spacing, rounded cards, responsive behavior, and billing/automation execution paths.
- Do not expose OAuth tokens, API keys, coupon secrets, password data, or raw sensitive payloads in UI, logs, API responses, or tests.
- Google and GitHub login must be removed; Firebase email/password login remains.
- Kakao/Naver login requires a provider-supplied valid email and merges only by normalized verified email.
- Administrator mutations require server role verification, CSRF protection, preview/confirmation phrases, self/last-admin safeguards, and append-only audit events.
- Coupon redemption must be transactional and idempotent. Access is `admin OR active Polar subscription OR active access grant`.
- The Automation page must not contain Audit Log or Admin DLQ tabs. Those operations live only under `/admin`.
- Every executable Action and every required input field must have non-empty guide metadata in the final `ActionDefinition`.
- Verification commands are `git diff --check`, `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run typecheck`, and `npm.cmd run build`.

---

### Task 1: Operational account and administrator authorization foundation

**Files:**
- Create: `src/lib/admin/schema.ts`
- Create: `src/lib/admin/account-admin.types.ts`
- Create: `src/lib/admin/account-admin.repository.ts`
- Create: `src/lib/admin/admin-guard.ts`
- Create: `app/api/auth/me/route.ts`
- Modify: `src/lib/auth/session-token.ts`
- Modify: `src/lib/auth/access-control.ts`
- Modify: `src/lib/auth/api-access-policy.ts`
- Modify: `src/lib/auth/owner-context.ts`
- Modify: `app/api/auth/login/route.ts`
- Test: `tests/admin-account-foundation.test.ts`
- Test: `tests/api-access-control.test.ts`

**Interfaces:**
- Produces `OperationalAccount`, `AccountStatus`, `AdminUserMutation`.
- Produces `upsertOperationalAccount`, `getOperationalAccount`, `listOperationalAccounts`, `mutateOperationalAccount`, `countActiveAdministrators`.
- Produces `requireAdminContext(request)` and `assertAdminMutationAllowed(actor, target, mutation)`.
- Extends `SessionClaims` with `entitled: boolean` and `sessionVersion: number`, while accepting legacy tokens that only contain `paid`.

- [ ] **Step 1: Write failing account/session/admin authorization tests**

```ts
test("session claims carry entitlement and invalidation version", async () => {
  const token = await createSessionToken({ uid: "u1", email: "user@example.com", paid: false, entitled: true, sessionVersion: 4 });
  const claims = await verifySessionToken(token);
  assert.equal(claims?.entitled, true);
  assert.equal(claims?.sessionVersion, 4);
});

test("administrator guard rejects normal users and self-destructive actions", () => {
  assert.throws(() => assertAdminMutationAllowed(admin, admin, "suspend"), /own administrator account/u);
  assert.throws(() => assertAdminMutationAllowed(user, target, "restore"), /Administrator access/u);
});
```

- [ ] **Step 2: Run the tests and verify the expected red state**

Run: `npm.cmd test`

Expected: failures because the operational account repository, admin guard, `/api/auth/me`, and extended session claims do not exist.

- [ ] **Step 3: Implement the schema and operational account repository**

```ts
export type AccountStatus = "active" | "suspended" | "deletion_pending" | "deleted";
export type OperationalAccount = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  status: AccountStatus;
  sessionVersion: number;
  createdAt: string;
  lastLoginAt: string;
  deletionScheduledAt: string | null;
};

export async function upsertOperationalAccount(input: {
  id: string;
  email: string;
  name?: string | null;
  provider: "password" | "kakao" | "naver";
}): Promise<OperationalAccount>;
```

`ensureAdminSchema()` creates `user_accounts`, `auth_identities`, and `admin_audit_events` with unique normalized email and provider identity indexes. Repository functions use PostgreSQL when `DATABASE_URL` exists and `readJsonStore`/`writeJsonStore` otherwise.

- [ ] **Step 4: Extend session validation and owner context**

```ts
export type SessionClaims = {
  uid: string;
  email: string;
  name: string | null;
  role: AccountRole;
  paid: boolean;
  entitled: boolean;
  sessionVersion: number;
  iat: number;
  exp: number;
};
```

`getOwnerContext` loads the operational account when present, rejects suspended/deleted accounts and stale `sessionVersion`, and continues to accept unmigrated legacy accounts. `decideApiAccess` uses `claims.entitled ?? claims.paid`.

- [ ] **Step 5: Add the current-session endpoint and synchronize password logins**

`GET /api/auth/me` returns only `{ access, account: { id, email, name, role, status } }`. `POST /api/auth/login` calls `upsertOperationalAccount` before issuing the session and calculates entitlement through the common entitlement service introduced in Task 3; until then it passes current billing access.

- [ ] **Step 6: Run tests and commit the foundation**

Run: `npm.cmd test`

Expected: all tests pass.

```bash
git add src/lib/admin src/lib/auth app/api/auth tests/admin-account-foundation.test.ts tests/api-access-control.test.ts
git commit -m "feat: add administrator account foundation"
```

### Task 2: Administrator API and responsive workspace

**Files:**
- Create: `app/admin/page.tsx`
- Create: `components/Admin/AdminShell.tsx`
- Create: `components/Admin/AdminOverview.tsx`
- Create: `components/Admin/AdminUsers.tsx`
- Create: `components/Admin/AdminOperations.tsx`
- Create: `components/Admin/AdminSystemStatus.tsx`
- Create: `app/api/admin/overview/route.ts`
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[userId]/route.ts`
- Create: `app/api/admin/users/[userId]/actions/route.ts`
- Create: `app/api/admin/system/status/route.ts`
- Modify: `components/layout/Topbar.tsx`
- Modify: `app/api/admin/audit-log/route.ts`
- Move behavior from: `app/api/automation/admin/dlq/route.ts`
- Create: `app/api/admin/automation/dlq/route.ts`
- Test: `tests/admin-workspace.test.ts`

**Interfaces:**
- Consumes the Task 1 account repository and `requireAdminContext`.
- Produces paginated `AdminOverview`, `AdminUserSummary`, and mutation responses.
- Reuses `listDeadLetterJobs`, `reexecuteDeadLetterJob`, automation audit repositories, and masked payload output.

- [ ] **Step 1: Write failing administrator UI/API tests**

```ts
test("profile menu exposes admin navigation only after server role verification", () => {
  const source = fs.readFileSync("components/layout/Topbar.tsx", "utf8");
  assert.match(source, /\/api\/auth\/me/u);
  assert.match(source, /관리자 페이지/u);
  assert.match(source, /account\?\.role === "admin"/u);
});

test("admin user mutations require confirmation and protect the last admin", () => {
  const route = fs.readFileSync("app/api/admin/users/[userId]/actions/route.ts", "utf8");
  assert.match(route, /requireAdminContext/u);
  assert.match(route, /confirmationPhrase/u);
  assert.match(route, /countActiveAdministrators/u);
});
```

- [ ] **Step 2: Run tests and confirm missing-page/API failures**

Run: `npm.cmd test`

Expected: failures for absent `/admin`, admin APIs, and profile navigation.

- [ ] **Step 3: Implement server-protected admin page and shell**

`app/admin/page.tsx` reads the session cookie, verifies it, confirms `role === "admin"`, and otherwise redirects to `/`. `AdminShell` provides Dashboard, Users, Subscriptions & Access, Coupons, Automation, DLQ, Audit Log, and System navigation with a mobile drawer.

- [ ] **Step 4: Implement overview, users, and mutation APIs**

```ts
type AdminAction = "suspend" | "restore" | "force_logout" | "promote" | "demote" | "schedule_delete" | "cancel_delete" | "delete";
const PHRASES: Record<AdminAction, string | null> = {
  suspend: "SUSPEND", restore: null, force_logout: "REVOKE", promote: "ADMIN",
  demote: "REVOKE", schedule_delete: "DELETE", cancel_delete: null, delete: "DELETE"
};
```

The route validates the exact phrase, blocks self/last-admin destructive changes, increments `sessionVersion` for suspension/role/force-logout, schedules deletion seven days ahead, and appends a masked audit event.

- [ ] **Step 5: Move DLQ and Audit Log into admin operations**

`AdminOperations` fetches `/api/admin/automation/dlq` and `/api/admin/audit-log`, masks payloads again, supports DLQ requeue, and records the requeue actor. The old automation-admin DLQ route becomes a compatibility redirect or is removed after callers are migrated.

- [ ] **Step 6: Implement status-only configuration diagnostics**

`GET /api/admin/system/status` returns booleans/status labels for PostgreSQL, Polar, Kakao, Naver, Firebase, and automation worker configuration. It never returns environment values.

- [ ] **Step 7: Run tests and commit the administrator workspace**

Run: `npm.cmd test`

Expected: all tests pass.

```bash
git add app/admin app/api/admin components/Admin components/layout/Topbar.tsx tests/admin-workspace.test.ts
git commit -m "feat: add administrator operations workspace"
```

### Task 3: Coupon domain, access grants, and Polar discounts

**Files:**
- Create: `src/lib/coupons/coupon.types.ts`
- Create: `src/lib/coupons/coupon-code.ts`
- Create: `src/lib/coupons/coupon.repository.ts`
- Create: `src/lib/coupons/coupon.service.ts`
- Create: `src/lib/billing/effective-entitlement.ts`
- Create: `app/api/admin/coupons/route.ts`
- Create: `app/api/admin/coupons/[couponId]/route.ts`
- Create: `app/api/admin/users/[userId]/access-grants/route.ts`
- Create: `app/api/coupons/prepare/route.ts`
- Create: `components/Admin/AdminCoupons.tsx`
- Modify: `src/lib/admin/schema.ts`
- Modify: `src/lib/billing/billing.repository.ts`
- Modify: `app/api/billing/checkout/route.ts`
- Modify: `app/api/webhooks/polar/route.ts`
- Modify: `src/lib/auth/api-access-policy.ts`
- Test: `tests/coupon-domain.test.ts`
- Test: `tests/coupon-routes.test.ts`

**Interfaces:**
- Produces `Coupon`, `CouponRedemption`, `AccessGrant`, `CouponCreateInput`.
- Produces `normalizeCouponCode`, `hashCouponCode`, `createCoupon`, `prepareCoupon`, `redeemPreparedCoupon`, `listCoupons`, `setCouponActive`, `grantAccess`, `revokeAccess`, `getActiveAccessGrant`, `getPreparedDiscount`.
- Produces `resolveEffectiveEntitlement(ownerId, billingEntitlement)`.

- [ ] **Step 1: Write failing coupon domain tests**

```ts
test("coupon codes normalize and hash without storing plaintext", async () => {
  assert.equal(normalizeCouponCode(" welcome-30 "), "WELCOME-30");
  const hashed = await hashCouponCode("WELCOME-30", "x".repeat(32));
  assert.notEqual(hashed, "WELCOME-30");
  assert.equal(hashed.length, 64);
});

test("effective entitlement accepts active grants and rejects expired grants", () => {
  assert.equal(isAccessGrantActive({ startsAt: past, endsAt: future, status: "active" }, now), true);
  assert.equal(isAccessGrantActive({ startsAt: past, endsAt: past, status: "active" }, now), false);
});
```

- [ ] **Step 2: Run tests and verify coupon functions are absent**

Run: `npm.cmd test`

Expected: failures because coupon types, hashing, repositories, and entitlement helpers do not exist.

- [ ] **Step 3: Extend the durable schema and implement transactional repositories**

Create `coupon_codes`, `coupon_redemptions`, and `access_grants`. PostgreSQL redemption uses `SELECT ... FOR UPDATE`, unique `(coupon_id, user_id, sequence)` constraints, and atomic count validation. Local fallback serializes mutations through the JSON store.

- [ ] **Step 4: Implement secure coupon creation and Polar discount creation**

```ts
export type CouponCreateInput = {
  name: string;
  code?: string;
  type: "access_duration" | "percentage_discount" | "fixed_discount";
  value?: number;
  accessDays?: number;
  currency?: string;
  duration: "once" | "months" | "forever";
  durationMonths?: number;
  maxRedemptions: number;
  perUserLimit: number;
  startsAt: string;
  expiresAt: string;
};
```

For discount coupons call `getPolarClient().discounts.create(...)`; save `polarDiscountId` only after successful creation. Return the generated plaintext code once and persist only HMAC-SHA256 plus a hint.

- [ ] **Step 5: Implement preparation, redemption, grants, and effective access**

`POST /api/coupons/prepare` validates format and rate limits attempts, then stores a short-lived signed HttpOnly pending-coupon cookie without exposing code validity. After authentication, `redeemPreparedCoupon` creates an access grant or discount reservation. `resolveEffectiveEntitlement` returns true for admin, active billing, or an active grant.

- [ ] **Step 6: Integrate discount checkout and webhook completion**

`POST /api/billing/checkout` reads the user's active reserved discount and passes `discountId` into `checkouts.create`. The Polar active/order webhook marks the reservation redeemed; failed checkout creation voids the reservation.

- [ ] **Step 7: Implement admin coupon and access grant UI/API**

The admin UI creates access-duration, percentage, and fixed coupons; displays masked code hint, type, limits, dates, usage, and state; and supports disable/reactivate. User detail can grant/revoke time-bound access with `REVOKE` confirmation.

- [ ] **Step 8: Run tests and commit coupons**

Run: `npm.cmd test`

Expected: all tests pass.

```bash
git add src/lib/coupons src/lib/billing app/api/admin/coupons app/api/coupons app/api/billing app/api/webhooks/polar components/Admin tests/coupon-domain.test.ts tests/coupon-routes.test.ts
git commit -m "feat: add access and discount coupons"
```

### Task 4: Kakao and Naver server OAuth with coupon-aware login

**Files:**
- Create: `src/lib/auth/social-oauth.types.ts`
- Create: `src/lib/auth/social-oauth.ts`
- Create: `src/lib/auth/oauth-login-state.ts`
- Create: `src/lib/auth/social-identity.service.ts`
- Create: `app/api/auth/oauth/[provider]/start/route.ts`
- Create: `app/api/auth/oauth/[provider]/callback/route.ts`
- Modify: `src/lib/admin/schema.ts`
- Modify: `src/lib/auth/api-access-policy.ts`
- Modify: `components/auth/LoginDialog.tsx`
- Modify: `components/auth/AuthGate.tsx`
- Modify: `src/lib/firebase/firebase-client.ts`
- Modify: `src/lib/firebase/firebase-auth-errors.ts`
- Remove: `src/lib/firebase/firebase-auth-providers.ts`
- Modify: `tests/login-page-redesign.test.ts`
- Test: `tests/social-oauth.test.ts`
- Test: `tests/social-oauth-routes.test.ts`

**Interfaces:**
- Produces `SocialProvider = "kakao" | "naver"`, `SocialProfile`, `createSocialAuthorizationUrl`, `exchangeSocialCode`, `fetchSocialProfile`.
- Produces `issueOAuthLoginState`, `consumeOAuthLoginState` with one-time DB state hash and signed cookie.
- Consumes Task 1 operational accounts and Task 3 pending coupon redemption.

- [ ] **Step 1: Write failing OAuth security and UI tests**

```ts
test("social OAuth validates provider state and requires an email", async () => {
  const issued = await issueOAuthLoginState({ provider: "kakao", pendingCouponId: null, now });
  await assert.rejects(() => consumeOAuthLoginState({ provider: "naver", state: issued.state, cookie: issued.cookie, now }), /state/u);
  assert.throws(() => normalizeSocialProfile({ subject: "1", email: null, name: "K" }), /email consent/u);
});

test("login UI replaces Google and GitHub with Kakao and Naver", () => {
  const source = fs.readFileSync("components/auth/LoginDialog.tsx", "utf8");
  assert.doesNotMatch(source, /Google로 계속하기|GitHub로 계속하기/u);
  assert.match(source, /카카오로 계속하기/u);
  assert.match(source, /네이버로 계속하기/u);
  assert.match(source, /쿠폰 코드/u);
});
```

- [ ] **Step 2: Run tests and confirm missing OAuth providers**

Run: `npm.cmd test`

Expected: failures for absent state/profile utilities and old provider buttons still present.

- [ ] **Step 3: Implement provider configuration and REST clients**

```ts
const PROVIDERS = {
  kakao: {
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    profileUrl: "https://kapi.kakao.com/v2/user/me"
  },
  naver: {
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    profileUrl: "https://openapi.naver.com/v1/nid/me"
  }
} as const;
```

Only server modules read `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `NAVER_REDIRECT_URI`, and `AUTH_OAUTH_STATE_SECRET`.

- [ ] **Step 4: Implement one-time OAuth state and identity linking**

The start route is POST, stores a state hash/expiry/used marker plus a signed HttpOnly cookie, and returns `{ authorizationUrl }`. The callback consumes the state once, exchanges the code, requires a valid provider email, links by unique provider subject or normalized verified email, creates an operational account when absent, and never stores provider tokens.

- [ ] **Step 5: Issue DREAMWISH sessions and restore non-Firebase sessions**

The callback computes effective entitlement, issues the same signed session cookie, redeems a pending coupon, and redirects to `/?oauth_login=success`. `AuthGate.restoreSession` first calls `/api/auth/me`; it does not destroy a valid server session when Firebase has no current user. Firebase token refresh remains active only for password accounts.

- [ ] **Step 6: Replace login provider UI and carry coupons safely**

`LoginDialog` adds optional coupon state and Apply guidance, Kakao yellow and Naver green buttons. `AuthGate` POSTs provider/coupon to the start route and assigns the returned HTTP(S) authorization URL. Password login sends the coupon code to `/api/auth/login`. Remove Google/GitHub imports, methods, and buttons.

- [ ] **Step 7: Run tests and commit social login**

Run: `npm.cmd test`

Expected: all tests pass.

```bash
git add src/lib/auth src/lib/firebase app/api/auth components/auth tests/social-oauth.test.ts tests/social-oauth-routes.test.ts tests/login-page-redesign.test.ts
git commit -m "feat: add Kakao and Naver login"
```

### Task 5: Registry-complete automation guide and output mapping

**Files:**
- Create: `src/lib/automation/registry/action-guide.ts`
- Create: `components/Automation/AutomationActionGuide.tsx`
- Create: `components/Automation/MappingSourcePicker.tsx`
- Modify: `src/lib/automation/registry/action.types.ts`
- Modify: `src/lib/automation/registry/action-registry.ts`
- Modify: `components/Automation/ActionInputForm.tsx`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `components/Automation/AutomationTabs.tsx`
- Test: `tests/automation-action-guide.test.ts`
- Test: `tests/automation-operations-ui.test.ts`

**Interfaces:**
- Adds `ActionGuideDefinition` and field properties `example`, `valueSource`, `mappingExample` to the final Registry contract.
- Produces `enrichActionDefinitionGuide(definition): ActionDefinition` and `listMappingSources(scenario, nodeId)`.
- Produces `MappingSource = { label: string; template: string; type: string; nodeId: string | null }`.

- [ ] **Step 1: Write failing Registry completeness and UI tests**

```ts
test("every executable action has complete guide metadata", () => {
  for (const definition of ACTION_DEFINITIONS.filter((item) => isActionExecutable(item.appId, item.id, item.version))) {
    assert.ok(definition.guide.useWhen.trim(), `${definition.appId}:${definition.id}`);
    for (const field of definition.inputSchema.fields.filter((item) => item.required)) {
      assert.ok(field.help?.trim(), `${definition.appId}:${definition.id}:${field.id}:help`);
      assert.ok(field.valueSource?.trim(), `${definition.appId}:${definition.id}:${field.id}:source`);
    }
  }
});

test("automation tabs exclude audit and DLQ while guide exposes registry details", () => {
  const tabs = fs.readFileSync("components/Automation/AutomationTabs.tsx", "utf8");
  assert.doesNotMatch(tabs, /감사 로그|관리자 DLQ|"audit"|"dlq"/u);
  const guide = fs.readFileSync("components/Automation/AutomationActionGuide.tsx", "utf8");
  assert.match(guide, /ACTION_DEFINITIONS/u);
  assert.match(guide, /언제 사용|값을 어디서|매핑/u);
});
```

- [ ] **Step 2: Run tests and confirm guide contract/UI failures**

Run: `npm.cmd test`

Expected: missing guide properties/components and existing Audit/DLQ tabs fail.

- [ ] **Step 3: Enrich final ActionDefinitions from central guide dictionaries**

```ts
export type ActionGuideDefinition = {
  summary: string;
  useWhen: string;
  setupSteps: string[];
  inputNotes: string[];
  outputMappings: Array<{ label: string; template: string }>;
};
```

`enrichActionDefinitionGuide` applies app/action overrides first and safe type/id fallbacks second. Secret fields receive only source instructions and never an example. `ACTION_DEFINITIONS` freezes the enriched definitions so all consumers share the same final contract.

- [ ] **Step 4: Implement searchable detailed guide**

`AutomationActionGuide` groups every final definition by app/tool, supports text/category/risk filters, shows executable/readiness state, auth setup from `AutomationAppDefinition`, and expands Action cards with use case, setup, scopes, risk/approval, field table, and output mapping examples.

- [ ] **Step 5: Add node ID copy and predecessor output picker**

The Inspector displays the selected node ID with a copy button. `listMappingSources` traverses incoming edges, reads trigger or predecessor output schemas, and generates `{{trigger.<field>}}` or `{{steps.<nodeId>.<field>}}`. `ActionInputForm` offers these sources for mappable fields and writes the selected template without requiring DevTools.

- [ ] **Step 6: Remove Audit/DLQ from Automation and use the new guide**

Remove tab union values, tab labels, component imports, and render branches for Audit/DLQ. Replace the compact six-card `AutomationGuide` with `AutomationActionGuide` while preserving the `guide` tab ID.

- [ ] **Step 7: Run tests and commit the guide**

Run: `npm.cmd test`

Expected: all tests pass and the Registry completeness loop has no missing executable Action.

```bash
git add src/lib/automation/registry components/Automation tests/automation-action-guide.test.ts tests/automation-operations-ui.test.ts
git commit -m "feat: add registry-complete automation guide"
```

### Task 6: Cross-feature integration, Railway documentation, and final verification

**Files:**
- Modify: `.env.example` if present, otherwise create `docs/railway-auth-coupon-env.md`
- Modify: `app/privacy/page.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `README.md` if present
- Test: `tests/admin-auth-coupon-integration.test.ts`

**Interfaces:**
- Documents exact Railway variables and callback URLs.
- Verifies the complete user journey from login coupon preparation to admin visibility and Automation guide access.

- [ ] **Step 1: Write failing integration/source contract tests**

```ts
test("Railway deployment contract lists both social providers and coupon hashing", () => {
  const docs = fs.readFileSync("docs/railway-auth-coupon-env.md", "utf8");
  for (const name of ["KAKAO_CLIENT_ID", "KAKAO_CLIENT_SECRET", "KAKAO_REDIRECT_URI", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "NAVER_REDIRECT_URI", "AUTH_OAUTH_STATE_SECRET", "COUPON_HASH_SECRET"]) {
    assert.match(docs, new RegExp(name));
  }
});
```

- [ ] **Step 2: Run tests and confirm missing deployment documentation**

Run: `npm.cmd test`

Expected: failure because Railway documentation and final contracts are absent.

- [ ] **Step 3: Document exact Railway setup and update legal disclosures**

Document both callback URLs, required provider email consent, Kakao REST API key vs secret, Naver client values, Polar permissions for Discounts, and secret rotation. Update privacy/terms to identify Kakao and Naver login processing and promotional access/discount code rules without weakening statutory rights.

- [ ] **Step 4: Run full verification**

```powershell
git diff --check
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git status --short --branch
```

Expected: every command exits 0; tests report zero failures; working tree contains only intentional committed changes.

- [ ] **Step 5: Review security-sensitive diff and push main**

Review OAuth callback validation, admin route guards, coupon code handling, session invalidation, and all response masking. Push only after the verification evidence is fresh.

```bash
git push origin main
```
