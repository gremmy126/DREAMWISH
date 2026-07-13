# Public AI Chat Home Implementation Plan

> Execute this plan with the `executing-plans`, `test-driven-development`, and `verification-before-completion` skills.

**Goal:** Make `/` a crawlable guest AI chat preview that opens an in-place Firebase login dialog and immediately becomes the existing authenticated workspace, while removing payment gating and keeping every protected API authenticated and owner-scoped.

**Architecture:** Keep the current authenticated `AppShell` and all sidebar views intact. Refactor `AuthGate` into the client-side experience switch: it server-renders the guest home while Firebase restores, owns the login dialog, and swaps to the authenticated children after the server session is issued. The guest home never mounts `ChatView`, so it cannot initiate AI, upload, memory, knowledge, CRM, or automation requests. Middleware remains the independent server boundary and admits every verified user instead of checking payment claims.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Firebase Auth, Tailwind CSS, Node test runner.

---

## Task 1: Lock the public-home and free-access contracts

**Files:**
- Create: `tests/public-ai-home.test.ts`
- Modify: `tests/api-access-control.test.ts`
- Modify: `tests/auth-and-ui-contract.test.ts`

1. Add failing source-contract tests for the `/` guest chat, exact locked placeholder, five example prompts, login dialog, Email/Google/GitHub controls, no lower feature/pricing sections, and guest-only ad component.
2. Change access-policy expectations so an unauthenticated protected request is `401`, any authenticated user is allowed, and admin routes still require the admin identity.
3. Add route/SEO contracts for `/chat`, `/login`, legacy billing pages, metadata, JSON-LD, robots, and sitemap.
4. Run the focused tests and confirm they fail for the intended missing behavior.

## Task 2: Remove payment gating without weakening authentication

**Files:**
- Modify: `src/lib/auth/access-control.ts`
- Modify: `src/lib/auth/api-access-policy.ts`
- Modify: `middleware.ts`
- Modify: `components/layout/Sidebar.tsx`
- Modify: `components/layout/Topbar.tsx`
- Modify: `components/auth/AuthGate.tsx`
- Delete: `src/lib/payments/*`
- Delete: `app/api/payments/polar/**`
- Delete: `app/api/webhooks/polar/route.ts`
- Delete: `tests/polar-checkout.test.ts`

1. Make a verified account immediately usable while retaining legacy session fields only for backward-compatible claim parsing.
2. Simplify API classes to public/protected/admin and remove all `402 PAYMENT_REQUIRED` behavior.
3. Remove checkout, upgrade, payment-state, and paid badge UI references.
4. Remove Polar runtime routes and libraries; confirm unauthenticated AI/API calls remain `401` and cross-user owner scoping tests still pass.

## Task 3: Build the guest chat home and modal login transition

**Files:**
- Create: `components/home/GuestChatHome.tsx`
- Create: `components/auth/LoginDialog.tsx`
- Create: `components/ads/GuestAdSlot.tsx`
- Modify: `components/auth/AuthGate.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/layout/Topbar.tsx`
- Modify: `app/page.tsx`

1. Render the guest chat shell during initial auth restoration so public HTML contains meaningful text for crawlers.
2. Make prompt cards and visually disabled input/upload/voice/send controls open the accessible modal; never mount the real chat or call an AI endpoint for guests.
3. Reuse the existing Firebase Email, Google, and GitHub functions in the dialog. Close it and swap to the authenticated `AppShell` via React state immediately after successful `/api/auth/login`, without reload or route change.
4. Keep logout on `/` so it returns directly to the guest chat.
5. Render the AdSense script and manual slot only inside the guest branch and only when advertising consent and a slot id are present.

## Task 4: Redirect obsolete routes and remove billing screens

**Files:**
- Create: `app/chat/page.tsx`
- Modify: `app/login/page.tsx`
- Modify: `app/pricing/page.tsx`
- Modify: `app/payment/success/page.tsx`
- Modify: `app/billing/success/page.tsx`
- Modify: `app/settings/billing/page.tsx`
- Delete: `app/pricing/PricingPageClient.tsx`

1. Redirect `/chat` to `/`.
2. Redirect `/login` to `/?login=1`, allowing bookmarked login links to open the modal on the home screen.
3. Redirect every legacy pricing/billing/payment screen to `/` and remove its unused client UI.

## Task 5: Complete public SEO and crawlability

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Create: `app/robots.ts`
- Create: `app/sitemap.ts`
- Modify: `src/lib/site/metadata.ts`

1. Add canonical metadata, title/description, robots directives, Open Graph, and Twitter cards for `https://dreamwish.co.kr/`.
2. Add crawlable SoftwareApplication/WebSite JSON-LD that describes the free authenticated AI workspace and does not advertise payment plans.
3. Publish robots and sitemap routes containing only public indexable pages.
4. Build and inspect the prerender manifest/output to verify `/`, `/robots.txt`, and `/sitemap.xml` are public static routes.

## Task 6: Verify, review, commit, deploy, and smoke-test

1. Run focused tests, then the complete test suite, typecheck, lint, and production build.
2. Inspect `git diff --check`, staged scope, and the final diff for secrets or unrelated files.
3. Commit the implementation on `codex/public-ai-home`, fast-forward it into `main`, and push `origin/main`.
4. Wait for the production deployment to become healthy.
5. Smoke-test public `/`, redirects, SEO endpoints, unauthenticated protected API `401`, modal opening, and guest-only ad placement. Do not create persistent test user data.
