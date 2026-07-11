# Verified OAuth Connections Implementation Plan

> **Execution:** Apply `superpowers:executing-plans` inline. Every production change follows `superpowers:test-driven-development`: add one focused failing test, verify the expected failure, implement the minimum behavior, and rerun the focused test before continuing.

**Goal:** Make Google services, Slack, GitHub, Notion, and Discord use canonical callbacks, owner-scoped OAuth state and tokens, and truthful verified connection states instead of treating configuration or environment tokens as connected accounts.

**Architecture:** `APP_URL` plus each registry `redirectPath` is the only runtime callback source. OAuth sessions and token records carry the authenticated owner ID. A provider identity verifier validates every newly exchanged or environment-provided token against the provider API, and the status API reports a richer state (`connected`, `configured_unverified`, `configuration_only`, `expired`, `revoked`, `error`, or `not_connected`) while preserving the legacy integration display status mapping.

**Tech Stack:** Next.js 15 route handlers, TypeScript, encrypted JSON repositories, Firebase-backed session cookies, Node test runner through `npm test`.

---

## Task 1: Make callback generation canonical and diagnostic

**Files:**
- Modify: `tests/oauth-integration-flow.test.ts`
- Modify: `src/lib/oauth/oauth-redirect.ts`
- Modify: `app/api/integrations/[connectorId]/connect/route.ts`

- [ ] Add a test proving a stale provider-specific redirect environment variable cannot override the canonical `APP_URL + redirectPath` callback.
- [ ] Add a test proving redirect diagnostics expose the configured and expected URI when they differ.
- [ ] Run `npm test -- tests/oauth-integration-flow.test.ts` and confirm both tests fail for the expected current behavior.
- [ ] Implement `getOAuthRedirectUri` from the public app URL and registry path only, plus a non-secret `getOAuthRedirectDiagnostic` result for configuration drift.
- [ ] Return structured configuration diagnostics only when OAuth client credentials are missing; do not block a valid canonical authorization URL because a legacy redirect variable is stale.
- [ ] Rerun the focused OAuth tests and confirm they pass.

## Task 2: Owner-scope OAuth sessions and reject cross-owner callback consumption

**Files:**
- Create: `tests/oauth-owner-scope.test.ts`
- Modify: `src/lib/repositories/oauth-session.repository.ts`
- Modify: `app/api/integrations/[connectorId]/connect/route.ts`
- Modify: `app/api/integrations/[connectorId]/callback/route.ts`

- [ ] Add repository tests proving an OAuth session records `ownerId`, can be consumed by its owner, and rejects a different owner.
- [ ] Run `npm test -- tests/oauth-owner-scope.test.ts` and confirm failure because sessions are currently ownerless.
- [ ] Add `ownerId` to session records and create/consume inputs; normalize legacy ownerless sessions as unusable rather than assigning them to the current user.
- [ ] Require the authenticated owner in connect and callback routes and pass the owner ID across repository calls.
- [ ] Rerun the owner-scope tests and confirm they pass.

## Task 3: Owner-scope encrypted tokens and lifecycle operations

**Files:**
- Modify: `tests/oauth-owner-scope.test.ts`
- Modify: `src/lib/oauth/oauth.types.ts`
- Modify: `src/lib/repositories/oauth-token.repository.ts`
- Modify: `src/lib/oauth/oauth-callback.ts`
- Modify: `src/lib/oauth/token.service.ts`
- Modify: `app/api/integrations/[connectorId]/disconnect/route.ts`

- [ ] Add tests proving save/list/revoke select tokens only for the supplied owner and cannot expose a legacy ownerless token.
- [ ] Run the focused test and confirm it fails because token operations are global.
- [ ] Add `ownerId` and verification metadata to token types and repository keys; require owner ID for save/list/revoke.
- [ ] Thread owner ID through callback persistence, active-token retrieval, refresh, status, and disconnect.
- [ ] Preserve legacy records only as quarantined data that requires reconnection.
- [ ] Rerun the focused test and confirm it passes.

## Task 4: Verify provider identity before declaring a connection

**Files:**
- Create: `tests/oauth-provider-verification.test.ts`
- Create: `src/lib/oauth/provider-verification.ts`
- Modify: `src/lib/oauth/oauth-callback.ts`
- Modify: `src/lib/oauth/token.service.ts`

- [ ] Add table-driven tests for Google userinfo, Slack `auth.test`, GitHub `/user`, Notion `/v1/users/me`, and Discord `/users/@me` response normalization using an injected fetch implementation.
- [ ] Add tests proving HTTP failure or provider-level `ok: false` produces an `error` verification result without leaking access tokens.
- [ ] Run the focused test and confirm failure because the verifier does not exist.
- [ ] Implement the minimal provider verifier and normalized verified identity result.
- [ ] Verify exchanged tokens before saving them active; persist `verifiedAt`, provider account label, workspace identity, and the last verification error.
- [ ] Treat environment tokens as `configured_unverified` until live verification succeeds; never label their environment variable name as an account.
- [ ] Rerun the focused test and confirm it passes.

## Task 5: Return truthful connection states and reconnect affordances

**Files:**
- Create: `tests/integration-connection-truth.test.ts`
- Modify: `src/lib/integrations/connection-status.ts`
- Modify: `app/api/integrations/status/route.ts`
- Modify: `components/Integrations/IntegrationCenter.tsx`
- Modify: `components/Integrations/OAuthConnectButton.tsx`
- Modify: `components/Integrations/IntegrationDisconnectButton.tsx`

- [ ] Add tests proving bare OAuth client configuration, environment tokens, Firebase project configuration, expired tokens, revoked tokens, and verified active tokens map to distinct truthful states.
- [ ] Run the focused test and confirm failure under the current three-state model.
- [ ] Extend connector auth state with `connectionState`, `canConnect`, `canReconnect`, `verifiedAt`, `expectedRedirectUri`, and safe diagnostics.
- [ ] Map only a verified active owner token to the display status `connected`; map Firebase to `configuration_only` and remove connector `mock_mode` claims from account status.
- [ ] Require owner context in the status route, use the shared safe API response reader in the UI, and render Connect/Reconnect/Disconnect labels according to the truthful state.
- [ ] Rerun the focused test and confirm it passes.

## Task 6: Verify the complete OAuth slice

**Files:**
- Modify if required by failures: only files listed in Tasks 1-5

- [ ] Run `npm test -- tests/oauth-integration-flow.test.ts tests/oauth-owner-scope.test.ts tests/oauth-provider-verification.test.ts tests/integration-connection-truth.test.ts`.
- [ ] Run `npm test` and confirm the full suite passes.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `git diff --check` and inspect `git diff --` for only intended OAuth/integration changes.
- [ ] Report that provider-console callback registration and interactive user consent are the remaining external steps; do not claim an account is connected until the live provider verification succeeds.
