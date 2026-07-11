# Firebase Authentication Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore email/password registration and login, Google and GitHub login, password reset, and safe authenticated password change through the existing Firebase-to-signed-session flow.

**Architecture:** Keep Firebase Client Auth as the browser identity provider and `/api/auth/login` as the only exchange from a Firebase ID token to the signed application cookie. Add pure helpers for safe Firebase errors and password/provider rules, then wire those helpers into the existing client and UI. Document and validate the server-only session secret without changing account, payment, or middleware architecture.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Authentication 12, Node test runner with Sucrase.

## Global Constraints

- Preserve the current account repository, payment gate, signed session cookie, and unrelated working-tree changes.
- Browser code may use only `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN`; secrets remain server-only.
- Local storage never establishes identity; a Firebase ID token remains mandatory for login and session refresh.
- Do not persist Firebase OAuth access tokens.
- Do not commit `.env.local` or any real secret.
- Because authentication files already contain user changes, do not create implementation commits that could accidentally capture unrelated work.

---

### Task 1: Safe Authentication Rules

**Files:**
- Create: `src/lib/firebase/firebase-auth-errors.ts`
- Create: `src/lib/firebase/firebase-password-policy.ts`
- Modify: `src/lib/firebase/firebase-auth-providers.ts`
- Modify: `tests/auth-and-ui-contract.test.ts`

**Interfaces:**
- Produces: `getFirebaseAuthErrorMessage(error: unknown): string`
- Produces: `validatePasswordChange(input): string | null`
- Produces: `hasPasswordProvider(providerData): boolean`
- Produces: `canEnableFirebaseGitHubLogin(): boolean`

- [ ] **Step 1: Write failing tests for stable error mapping**

Add assertions that `auth/invalid-credential`, `auth/popup-closed-by-user`, `auth/popup-blocked`, `auth/account-exists-with-different-credential`, `auth/requires-recent-login`, `auth/unauthorized-domain`, and unknown errors return safe Korean messages without echoing secret details.

- [ ] **Step 2: Write failing tests for password and provider rules**

Assert that current password is required, new passwords must be at least six characters and match confirmation, and only provider data containing `{ providerId: "password" }` enables authenticated password change.

- [ ] **Step 3: Write a failing GitHub configuration test**

Assert that the browser-visible GitHub enable decision depends only on `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN === "true"`, never on server-only `GITHUB_CLIENT_ID`.

- [ ] **Step 4: Run the test suite and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because the helper modules and desired provider rule do not exist.

- [ ] **Step 5: Implement the pure helpers**

Implement code-based Firebase error mapping with a generic fallback, exact password validation, password-provider detection, and the public GitHub flag rule.

- [ ] **Step 6: Run the test suite and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 2: Firebase Client Reauthentication

**Files:**
- Modify: `src/lib/firebase/firebase-client.ts`
- Modify: `tests/auth-and-ui-contract.test.ts`

**Interfaces:**
- Produces: `changeFirebasePassword(input: { currentPassword: string; newPassword: string }): Promise<void>`
- Produces: `firebaseUserHasPasswordProvider(): boolean`
- Consumes: `hasPasswordProvider(providerData)` from Task 1.

- [ ] **Step 1: Write failing source-contract tests**

Assert that the Firebase client imports and calls `EmailAuthProvider.credential`, `reauthenticateWithCredential`, and then `updatePassword`, and exports password-provider detection.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because current code calls `updatePassword` directly.

- [ ] **Step 3: Implement recent-login reauthentication**

Require a current user and email, construct an email credential from the current password, reauthenticate, and update to the validated new password. Expose provider detection using `currentUser.providerData`.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 3: Login and Password User Experience

**Files:**
- Modify: `components/auth/AuthGate.tsx`
- Modify: `tests/auth-and-ui-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 error and validation helpers.
- Consumes: Task 2 reauthentication and provider detection.
- Preserves: ID-token-only calls to `/api/auth/login` and `/api/auth/session`.

- [ ] **Step 1: Write failing UI contract tests**

Assert that the component uses `getFirebaseAuthErrorMessage`, `validatePasswordChange`, `canEnableFirebaseGitHubLogin`, current/new/confirmation password fields, and does not call `window.prompt`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because the old prompt and raw error handling remain.

- [ ] **Step 3: Wire safe errors into every auth action**

Use the Firebase mapper for sign-in, sign-up, reset, Google, GitHub, and password-change failures. Keep server-returned session errors actionable but do not expose credentials or secrets.

- [ ] **Step 4: Add explicit password-change UI**

Show the action only for password-provider users. Render current password, new password, confirmation, cancel, and submit controls. Validate locally, reauthenticate, update the password, clear the fields, and show a success message.

- [ ] **Step 5: Fix signup and GitHub mode behavior**

Show the name input only in signup mode, set correct password autocomplete values, use the browser-safe GitHub helper, and retain duplicate-submit disabling for every provider button.

- [ ] **Step 6: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 4: Required Configuration and Documentation

**Files:**
- Modify: `.env.example`
- Modify locally only: `.env.local`
- Create: `docs/authentication.md`
- Modify: `tests/auth-and-ui-contract.test.ts`

**Interfaces:**
- Requires: `AUTH_SESSION_SECRET` containing at least 32 bytes.
- Documents: Firebase provider and domain settings plus Railway variables.

- [ ] **Step 1: Write a failing configuration contract test**

Assert that `.env.example` declares `AUTH_SESSION_SECRET` as server-only and that `docs/authentication.md` names Email/Password, Google, GitHub, authorized domains, Firebase's GitHub callback URL, and Railway configuration.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: FAIL because the session variable and authentication guide are absent.

- [ ] **Step 3: Add safe configuration templates and guide**

Add an empty `AUTH_SESSION_SECRET` entry with generation guidance to `.env.example`. Write exact console and Railway steps without real values. Add a generated development-only value to ignored `.env.local` without printing or committing it.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

### Task 5: Full Verification

**Files:**
- Verify only; do not modify unrelated failures without tracing their root cause.

- [ ] **Step 1: Review the scoped diff**

Run: `git diff --check` and `git diff -- .env.example components/auth/AuthGate.tsx src/lib/firebase tests/auth-and-ui-contract.test.ts docs/authentication.md`

Expected: no whitespace errors and only intended authentication changes.

- [ ] **Step 2: Run all verification commands**

Run: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`.

Expected: zero test failures, zero TypeScript errors, lint exit code 0, and Next.js production build exit code 0.

- [ ] **Step 3: Check secret boundaries**

Run searches confirming `AUTH_SESSION_SECRET` has no `NEXT_PUBLIC_` prefix, client files contain no GitHub secret references, and `.env.local` remains untracked.

- [ ] **Step 4: Report manual console requirements**

List the exact Firebase Authorized Domains, enabled providers, Firebase GitHub callback URL requirement, and Railway environment variables that still require the user's console access.
