# Authenticated Paid Access and Polar Entitlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce Firebase-authenticated, Polar-paid access at the server boundary while preserving the single administrator bypass.

**Architecture:** Firebase ID tokens bootstrap short-lived signed HttpOnly sessions. Next middleware gates protected APIs using those signed claims, while hardened Polar checkout and webhook handlers update explicit account entitlement states.

**Tech Stack:** Next.js 15 middleware/route handlers, Web Crypto HMAC-SHA256, Firebase Identity Toolkit, Polar REST/Standard Webhooks, TypeScript, Node tests.

## Global Constraints

- Never trust request-body email, localStorage, or client headers for identity or admin access.
- Only the configured administrator bypasses payment.
- Non-admin protected API access requires an active server entitlement.
- Polar webhook verification is fail-closed and idempotent.
- Checkout identity and product must match the authenticated Firebase user and configured product.

---

### Task 1: Signed Firebase server session and API policy

**Files:**
- Create: `src/lib/auth/session-token.ts`
- Create: `src/lib/auth/api-access-policy.ts`
- Create: `middleware.ts`
- Modify: `src/lib/firebase/firebase-server-auth.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/session/route.ts`
- Modify: `components/auth/AuthGate.tsx`
- Create: `tests/api-access-control.test.ts`

**Interfaces:**
- `createSessionToken(claims): Promise<string>`
- `verifySessionToken(token): Promise<SessionClaims | null>`
- `classifyApiAccess(pathname): "public" | "checkout" | "protected" | "admin"`

- [ ] Write failing tests for tampered/expired session tokens, public route exceptions, protected unpaid access, body-email spoofing, and admin-header spoofing.
- [ ] Run the focused tests and confirm failure for missing modules and current spoofable behavior.
- [ ] Implement HMAC-signed expiring claims and stable access classification.
- [ ] Require Firebase ID tokens in both auth routes, set the cookie, remove localStorage-only restoration, and clear the cookie on logout.
- [ ] Add middleware returning `401`, `402`, or `403` before protected APIs execute.
- [ ] Run focused tests and typecheck; expect zero failures.

### Task 2: Polar identity binding and entitlement lifecycle

**Files:**
- Modify: `src/lib/auth/access-control.ts`
- Modify: `src/lib/auth/account.repository.ts`
- Modify: `src/lib/payments/polar.service.ts`
- Modify: `src/lib/repositories/payment.repository.ts`
- Modify: `app/api/payments/polar/checkout/route.ts`
- Modify: `app/api/payments/polar/checkout/[checkoutId]/route.ts`
- Modify: `app/api/webhooks/polar/route.ts`
- Modify: `tests/polar-checkout.test.ts`
- Create: `tests/polar-entitlement.test.ts`

**Interfaces:**
- `EntitlementStatus = "inactive" | "active" | "past_due" | "revoked" | "refunded"`
- `applyPolarEntitlementEvent(event): Promise<{duplicate; accessUpdated}>`
- `getSessionClaimsFromRequest(request): Promise<SessionClaims | null>`

- [ ] Write failing tests for authenticated checkout payload identity, missing webhook secret, stale/invalid signatures, duplicate event IDs, explicit grant/revoke events, and mismatched user/product.
- [ ] Run focused tests and confirm each fails for the intended vulnerable behavior.
- [ ] Migrate account state to explicit entitlement status while keeping compatible `paid`/`AccessState` output.
- [ ] Send verified UID/email/name/IP and metadata in Polar checkout creation.
- [ ] Bind checkout verification to the signed user and configured product.
- [ ] Make the webhook fail closed, timestamp-bound, idempotent, and allowlist-driven.
- [ ] Run focused tests, full tests, lint, typecheck, and build.

### Task 3: Deployment contract and final security review

**Files:**
- Modify: `.env.example`
- Modify: `docs/railway-auth-and-memory.md`
- Create: `docs/security/auth-polar-access.md`

- [ ] Document `AUTH_SESSION_SECRET`, mandatory `POLAR_WEBHOOK_SECRET`, subscribed Polar events, Firebase authorized domains, and Railway redeploy requirements.
- [ ] Re-run the exploit-oriented tests with a tampered cookie, unpaid valid cookie, forged admin header, unsigned webhook, duplicate webhook, and creation-only event.
- [ ] Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- [ ] Review the final diff for unrelated changes, commit to `main`, and push `origin/main`.
