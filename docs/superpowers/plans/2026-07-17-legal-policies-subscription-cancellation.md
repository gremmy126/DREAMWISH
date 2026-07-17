# DREAMWISH Legal Policies and Subscription Cancellation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish accurate Korean legal policy pages and add a secure Settings entry point for canceling a Polar monthly subscription at period end.

**Architecture:** Legal pages share immutable operator metadata and one server-rendered layout, while each route owns its policy copy and metadata. Billing remains authoritative in Polar: webhooks project cancellation scheduling into the local entitlement record, and Settings creates an authenticated Polar customer portal session for the final cancellation action.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Tailwind CSS, Polar SDK 0.48, Node assert test harness, PostgreSQL/JSON entitlement repository.

## Global Constraints

- Preserve the current DREAMWISH colors, typography, cards, and overall visual language.
- Publish `/privacy`, `/terms`, `/refunds`, and `/cookies` in readable Korean with canonical metadata.
- Use `드림위시`, representative `김동현`, registration `147-07-03187`, mail-order report `제 2026-부산사상구-0185`, address `부산광역시 사상구 덕상로 8-37, 202동 2504호`, phone `051-916-1222`, and email `adveryhyeon@gmail.com` from one source.
- State that discretionary refunds are generally unavailable, but do not exclude mandatory statutory withdrawal, termination, or refund rights.
- Cancellation stops future renewal, keeps access through the paid period, and is not itself a refund.
- Do not collect or store payment card data; final cancellation occurs in Polar's authenticated customer portal.
- A scheduled cancellation must not remove paid access before the current period ends.
- Work directly on `main`; push only after tests, lint, typecheck, build, and `git status` succeed.

---

### Task 1: Shared legal metadata, layout, and navigation

**Files:**
- Create: `src/lib/legal/policy.ts`
- Create: `components/legal/PolicyLayout.tsx`
- Create: `tests/legal-policy-pages.test.ts`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/home/GuestChatHome.tsx`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Produces: `OPERATOR_INFO`, `POLICY_EFFECTIVE_DATE`, `POLICY_LAST_UPDATED`, `POLICY_LINKS`, `PolicyLayout`, and `PolicySection`.
- Consumes: existing design tokens `bg-app-bg`, `bg-app-card`, `border-app-border`, `text-app-text`, `text-app-muted`, and `text-app-primary`.

- [ ] **Step 1: Write the failing policy shell test**

Create `tests/legal-policy-pages.test.ts` with source-contract assertions:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file: string) => fs.readFileSync(file, "utf8");

test("legal pages share one operator record and policy layout", () => {
  const policy = read("src/lib/legal/policy.ts");
  const layout = read("components/legal/PolicyLayout.tsx");
  assert.match(policy, /businessName:\s*"드림위시"/u);
  assert.match(policy, /representative:\s*"김동현"/u);
  assert.match(policy, /147-07-03187/u);
  assert.match(policy, /제 2026-부산사상구-0185/u);
  assert.match(policy, /051-916-1222/u);
  assert.match(policy, /adveryhyeon@gmail\.com/u);
  assert.match(layout, /OPERATOR_INFO/u);
  assert.match(layout, /POLICY_LINKS/u);
});

test("refund policy is linked from public navigation and sitemap", () => {
  for (const file of [
    "components/layout/AppShell.tsx",
    "components/home/GuestChatHome.tsx",
    "app/sitemap.ts"
  ]) {
    assert.match(read(file), /\/refunds/u, file);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`

Expected: FAIL because `src/lib/legal/policy.ts`, `components/legal/PolicyLayout.tsx`, and `/refunds` links do not exist.

- [ ] **Step 3: Add immutable legal metadata**

Create `src/lib/legal/policy.ts` with these exports:

```ts
export const POLICY_EFFECTIVE_DATE = "2026년 7월 17일";
export const POLICY_LAST_UPDATED = "2026년 7월 17일";

export const OPERATOR_INFO = Object.freeze({
  businessName: "드림위시",
  representative: "김동현",
  businessRegistrationNumber: "147-07-03187",
  mailOrderRegistrationNumber: "제 2026-부산사상구-0185",
  address: "부산광역시 사상구 덕상로 8-37, 202동 2504호",
  phone: "051-916-1222",
  email: "adveryhyeon@gmail.com"
});

export const POLICY_LINKS = [
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/cookies", label: "쿠키 정책" },
  { href: "/terms", label: "이용약관" },
  { href: "/refunds", label: "환불 및 구독 해지" }
] as const;
```

- [ ] **Step 4: Add the shared server-rendered policy layout**

Create `components/legal/PolicyLayout.tsx` exporting:

```ts
export function PolicyLayout(props: {
  title: string;
  description: string;
  children: React.ReactNode;
})

export function PolicySection(props: {
  id: string;
  title: string;
  children: React.ReactNode;
})
```

The layout renders the DREAMWISH home link, title, description, effective and updated dates, children, an operator-information definition list from `OPERATOR_INFO`, and navigation generated from `POLICY_LINKS`. `PolicySection` renders an `id`-addressable heading and content area with list and table styles inherited from the existing policy card design.

- [ ] **Step 5: Add `/refunds` to both footers and the sitemap**

Add `환불 및 구독 해지` links to `AppFooter` and `GuestChatHome`, and add:

```ts
{ url: `${SITE_URL}/refunds`, lastModified: now, changeFrequency: "yearly", priority: 0.3 }
```

to `app/sitemap.ts`.

- [ ] **Step 6: Run the focused tests**

Run: `npm test`

Expected: PASS for both new contracts.

- [ ] **Step 7: Commit the legal shell**

```bash
git add src/lib/legal/policy.ts components/legal/PolicyLayout.tsx tests/legal-policy-pages.test.ts components/layout/AppShell.tsx components/home/GuestChatHome.tsx app/sitemap.ts
git commit -m "feat: add shared legal policy shell"
```

---

### Task 2: Korean privacy, terms, refund, and cookie policies

**Files:**
- Modify: `tests/legal-policy-pages.test.ts`
- Rewrite: `app/privacy/page.tsx`
- Rewrite: `app/terms/page.tsx`
- Create: `app/refunds/page.tsx`
- Rewrite: `app/cookies/page.tsx`
- Modify: `tests/public-ai-home.test.ts`

**Interfaces:**
- Consumes: `PolicyLayout`, `PolicySection`, `OPERATOR_INFO`, and the policy dates from Task 1.
- Produces: four crawlable policy routes with Korean metadata and cross-links.

- [ ] **Step 1: Add failing content and encoding tests**

Extend `tests/legal-policy-pages.test.ts` to assert each route exists, uses `PolicyLayout`, has its canonical route, contains no Unicode replacement character, and contains the required headings:

```ts
const required = new Map([
  ["app/privacy/page.tsx", ["개인정보 처리방침", "처리 목적", "처리하는 개인정보", "국외 이전", "이용자의 권리"]],
  ["app/terms/page.tsx", ["서비스 이용약관", "AI 결과", "외부 서비스와 자동화", "유료 구독", "계약 해지"]],
  ["app/refunds/page.tsx", ["환불 및 구독 해지 정책", "임의 환불", "구독 해지", "법정 권리", "플랫폼 오류"]],
  ["app/cookies/page.tsx", ["쿠키 정책", "필수 쿠키", "분석 쿠키", "Google Consent Mode", "설정 변경"]]
]);
for (const [file, headings] of required) {
  const source = read(file);
  assert.match(source, /<PolicyLayout/u, file);
  assert.doesNotMatch(source, /�/u, file);
  for (const heading of headings) assert.match(source, new RegExp(heading, "u"), file);
}
```

Update the metadata route list in `tests/public-ai-home.test.ts` to include `app/refunds/page.tsx` and `/refunds`.

- [ ] **Step 2: Run tests to verify the new contracts fail**

Run: `npm test`

Expected: FAIL because `/refunds` is missing and the existing policy files contain mojibake and lack required sections.

- [ ] **Step 3: Rewrite the privacy policy**

Implement Korean sections with these exact responsibilities:

1. controller and scope;
2. processing purposes;
3. categories collected directly, automatically, through OAuth, and during payment;
4. collection methods;
5. retention and statutory records;
6. third-party/user-directed transfers;
7. processors and overseas processing for Firebase/Google, Polar, configured AI providers, hosting/storage, analytics, and user-selected integrations;
8. destruction;
9. data-subject rights and contact method;
10. children;
11. automated AI processing and consequential-decision warning;
12. cookies and Consent Mode;
13. safeguards and secret masking;
14. privacy contact using `OPERATOR_INFO`;
15. change notice and effective date.

Use tables for information categories, retention, and overseas providers. Describe provider-dependent regions and retention as provider/contract dependent instead of fabricating fixed locations or periods.

- [ ] **Step 4: Rewrite the terms**

Implement Korean articles covering purpose/definitions, agreement formation, eligibility, account security, service features, AI limitations, user content, OAuth/integrations, preview and high-risk automation approvals, prohibited use, monthly subscription and automatic renewal, payment failure, cancellation at period end, refund-policy precedence subject to mandatory law, suspension/termination, maintenance, liability limits subject to mandatory law, notices, governing law/disputes, and operator information.

- [ ] **Step 5: Create the refund and cancellation policy**

Implement Korean sections stating:

- paid digital service begins immediately after successful checkout;
- DREAMWISH does not provide a voluntary refund merely for change of mind or non-use;
- cancellation stops the next renewal, is not a refund, and leaves access until the current paid period ends;
- material platform error, material non-provision, contract mismatch, duplicate payment, and erroneous payment are explicit review grounds;
- mandatory statutory withdrawal/termination/refund rights remain available and prevail over conflicting voluntary terms;
- requests go to `OPERATOR_INFO.email` with account email, payment date, amount, reason, and evidence;
- approved refunds use the original payment method and applicable statutory processing period, with additional card-company settlement time possible.

Do not include categorical phrases equivalent to `어떠한 경우에도 환불 불가`, `결제 즉시 사용한 것으로 간주`, or `법정 청약철회 불가`.

- [ ] **Step 6: Rewrite the cookie policy**

Match the implemented consent system: necessary/security storage always enabled; analytics and advertising default denied; functionality enabled; consent stored as `cookieConsent` in cookie/localStorage for 180 days; Google Consent Mode v2 updates `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`, `functionality_storage`, and `security_storage`; settings can be reopened from the footer or Settings.

- [ ] **Step 7: Run policy and metadata tests**

Run: `npm test`

Expected: PASS with all four routes and no mojibake in rewritten policy source.

- [ ] **Step 8: Commit policy content**

```bash
git add app/privacy/page.tsx app/terms/page.tsx app/refunds/page.tsx app/cookies/page.tsx tests/legal-policy-pages.test.ts tests/public-ai-home.test.ts
git commit -m "feat: publish Korean legal policies"
```

---

### Task 3: Durable Polar cancellation projection

**Files:**
- Modify: `tests/polar-routes.test.ts`
- Modify: `tests/polar-entitlement.test.ts`
- Modify: `src/lib/billing/billing.types.ts`
- Modify: `src/lib/billing/polar-event.ts`
- Modify: `src/lib/billing/billing.repository.ts`

**Interfaces:**
- Produces: `BillingEntitlement.cancelAtPeriodEnd: boolean`, `canceledAt: string | null`, and `endsAt: string | null`.
- Produces: matching fields on `NormalizedPolarBillingEvent`.
- Consumes: Polar webhook payload camelCase or snake_case fields.

- [ ] **Step 1: Write failing cancellation projection tests**

Extend `tests/polar-routes.test.ts` so a `subscription.updated` payload containing `status: "active"`, `cancel_at_period_end: true`, `canceled_at`, `ends_at`, and `current_period_end` must normalize to the matching typed fields while retaining event type `subscription.active`.

Extend `tests/polar-entitlement.test.ts` with source assertions that the entitlement type/default include all three cancellation fields and that `applyPolarBillingEvent` persists them without changing active access solely because `cancelAtPeriodEnd` is true.

- [ ] **Step 2: Run Polar tests to verify failure**

Run: `npm test`

Expected: FAIL because the normalized event and entitlement do not expose cancellation scheduling fields.

- [ ] **Step 3: Extend billing types and defaults**

Add to `BillingEntitlement` and `emptyBillingEntitlement`:

```ts
cancelAtPeriodEnd: boolean;
canceledAt: string | null;
endsAt: string | null;
```

with defaults `false`, `null`, and `null`.

- [ ] **Step 4: Normalize Polar cancellation fields**

Add the same fields to `NormalizedPolarBillingEvent`. Implement `readBoolean` for both camelCase and snake_case keys, and map:

```ts
cancelAtPeriodEnd: readBoolean(data, "cancelAtPeriodEnd", "cancel_at_period_end") ?? false,
canceledAt: readString(data, "canceledAt", "canceled_at") || null,
endsAt: readString(data, "endsAt", "ends_at") || null
```

Do not convert an active, cancel-at-period-end subscription to local `canceled` before Polar reports the final canceled state.

- [ ] **Step 5: Persist fields through the entitlement repository**

Extend `applyPolarBillingEvent` input and update projection. Preserve current values when an event omits a nullable field, but accept explicit booleans. Extend `normalizeEntitlement` so old records safely receive defaults.

- [ ] **Step 6: Run focused Polar tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit billing projection**

```bash
git add tests/polar-routes.test.ts tests/polar-entitlement.test.ts src/lib/billing/billing.types.ts src/lib/billing/polar-event.ts src/lib/billing/billing.repository.ts
git commit -m "feat: track scheduled subscription cancellation"
```

---

### Task 4: Settings subscription card and authenticated cancellation portal

**Files:**
- Create: `components/billing/SubscriptionSettingsCard.tsx`
- Create: `tests/subscription-settings.test.ts`
- Modify: `components/Settings/SettingsView.tsx`
- Modify: `app/api/billing/portal/route.ts`
- Modify: `src/lib/navigation/workspace-view.ts`
- Modify: `tests/polar-routes.test.ts`

**Interfaces:**
- Consumes: `GET /api/billing/status` returning `{ entitlement: BillingEntitlement }`.
- Consumes: `POST /api/billing/portal` returning `{ ok: true, portalUrl: string }`.
- Produces: `SubscriptionSettingsCard` with no props.
- Produces: billing return resolution for `/?view=settings&billing=return`.

- [ ] **Step 1: Write failing Settings and portal contracts**

Create `tests/subscription-settings.test.ts` asserting source contracts:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file: string) => fs.readFileSync(file, "utf8");

test("Settings exposes a subscription cancellation card", () => {
  const settings = read("components/Settings/SettingsView.tsx");
  const card = read("components/billing/SubscriptionSettingsCard.tsx");
  assert.match(settings, /<SubscriptionSettingsCard/u);
  assert.match(card, /구독 및 결제/u);
  assert.match(card, /구독 해지/u);
  assert.match(card, /\/api\/billing\/status/u);
  assert.match(card, /\/api\/billing\/portal/u);
  assert.match(card, /현재 결제 기간이 끝날 때까지/u);
  assert.match(card, /환불을 의미하지 않습니다/u);
  assert.match(card, /min-h-11/u);
});

test("billing portal returns users to Settings", () => {
  assert.match(read("app/api/billing/portal/route.ts"), /\?view=settings&billing=return/u);
  const navigation = read("src/lib/navigation/workspace-view.ts");
  assert.match(navigation, /billing/u);
  assert.match(navigation, /settings/u);
});
```

Extend `tests/polar-routes.test.ts` to require authenticated owner context and the fixed Settings return URL.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test`

Expected: FAIL because the card is absent and the portal returns to the site root.

- [ ] **Step 3: Build the subscription settings card**

`SubscriptionSettingsCard` fetches `/api/billing/status` with `cache: "no-store"` on mount and after a billing return. It renders loading, error with retry, no-subscription, active, past-due, scheduled-cancellation, and ended states.

For active subscriptions, render a red-outline `구독 해지` button. Clicking opens an accessible `role="dialog"`, `aria-modal="true"` confirmation with `취소` and `Polar에서 해지 계속` buttons. Confirmation POSTs `/api/billing/portal`, prevents duplicate submission, validates `portalUrl`, and calls `window.location.assign(portalUrl)`. The dialog states that renewal stops, access remains through the paid-period end, and cancellation is not a refund. Link to `/refunds`.

- [ ] **Step 4: Integrate the card into Settings**

Import `CreditCard` and `SubscriptionSettingsCard`, add a `billing` item to the local Settings section metadata, and render the card after the account/profile card so it is visible without changing the existing grid or card styles.

- [ ] **Step 5: Return Polar portal users to Settings**

Change the customer session return URL to:

```ts
returnUrl: `${getAppOrigin()}/?view=settings&billing=return`
```

Update `resolveWorkspaceView` so it returns `settings` only for the explicit billing return marker, while preserving the existing integrations OAuth return behavior. The AppShell continues removing the transient query after it resolves the initial view.

- [ ] **Step 6: Run focused tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 7: Commit cancellation UI**

```bash
git add components/billing/SubscriptionSettingsCard.tsx components/Settings/SettingsView.tsx app/api/billing/portal/route.ts src/lib/navigation/workspace-view.ts tests/subscription-settings.test.ts tests/polar-routes.test.ts
git commit -m "feat: add subscription cancellation settings"
```

---

### Task 5: Full regression verification and delivery

**Files:**
- Modify only if a verification failure identifies a defect in the files from Tasks 1-4.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-4.
- Produces: a verified `main` commit series ready for push.

- [ ] **Step 1: Run formatting and repository checks**

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 2: Run all tests**

Run: `npm test`

Expected: exit 0 and all registered tests passed.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 4: Run TypeScript validation**

Run: `npm run typecheck`

Expected: exit 0 with no TypeScript diagnostics.

- [ ] **Step 5: Run the production build**

Run: `npm run build`

Expected: exit 0 and Next.js production build completes with `/privacy`, `/terms`, `/refunds`, and `/cookies` generated.

- [ ] **Step 6: Inspect final repository state**

Run: `git status --short --branch`

Expected: `main` is ahead of `origin/main` only by the intentional commits and has no uncommitted files.

- [ ] **Step 7: Push verified main**

Run: `git push origin main`

Expected: remote `main` advances to the final local commit.
