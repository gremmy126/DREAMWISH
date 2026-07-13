# Authentication Session and Google Login Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production Firebase session exchange, return correct authentication status codes without leaking server configuration, and show provider-appropriate Google login errors.

**Architecture:** Keep Firebase Client Auth as the browser identity provider and keep `/api/auth/login` plus `/api/auth/session` as the only Firebase-ID-token exchange points. Centralize public auth-route error conversion, normalize Firebase lookup failures to application authentication failures, and make client error copy provider-aware. The production deployment must receive a new server-only `AUTH_SESSION_SECRET` of at least 32 bytes; code must never invent or expose that secret.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Authentication 12, Node test runner with Sucrase, Railway.

## Global Constraints

- Preserve Firebase uid as the canonical owner identifier.
- Never log or return Firebase ID tokens, OAuth credentials, session secrets, or raw internal exceptions.
- `AUTH_SESSION_SECRET` remains server-only and must contain at least 32 bytes.
- Firebase client configuration, Google provider, and `dreamwish.co.kr` authorized-domain settings are already verified against project `dreamwish-18b63` and must not be replaced.
- The temporary diagnostic Firebase account has already been deleted.
- Do not stage the unrelated untracked file `h origin main`.

---

### Task 1: Safe Auth Route Error Boundary

**Files:**
- Create: `src/lib/auth/auth-route-error.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `app/api/auth/session/route.ts`
- Test: `tests/api-access-control.test.ts`

**Interfaces:**
- Consumes: `AIProviderError` from `src/lib/ai/errors.ts`.
- Produces: `getAuthRouteError(error: unknown): { status: 401 | 500; message: string }`.

- [ ] **Step 1: Write failing route regression tests**

Append tests that mock Firebase lookup with a 400 response and assert that both routes return 401, then run with a missing `AUTH_SESSION_SECRET` and a valid Firebase lookup and assert a 500 response whose body does not contain `AUTH_SESSION_SECRET`, `32 bytes`, or the thrown message.

```ts
test("auth routes classify rejected Firebase tokens as 401", async () => {
  await withEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-test-key" }, async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      for (const routePath of ["login", "session"] as const) {
        const route = requireProjectModule<{ POST(request: Request): Promise<Response> }>(
          `app/api/auth/${routePath}/route.ts`
        );
        const response = await route.POST(
          new Request(`http://localhost/api/auth/${routePath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken: "rejected-token" })
          })
        );
        assert.equal(response.status, 401);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

Add a second test with a successful lookup, `AUTH_SESSION_SECRET: undefined`, and `DATA_DIR` set to a temporary directory. Assert `{ ok: false, error: "Authentication service is temporarily unavailable." }` for both routes and clean up the directory in `finally`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: the invalid-token test receives 500 and the configuration-failure test exposes `AUTH_SESSION_SECRET must contain at least 32 bytes.`

- [ ] **Step 3: Implement the public error boundary**

Create `src/lib/auth/auth-route-error.ts`:

```ts
import { AIProviderError } from "@/src/lib/ai/errors";

export type AuthRouteError = {
  status: 401 | 500;
  message: string;
};

export function getAuthRouteError(error: unknown): AuthRouteError {
  if (error instanceof AIProviderError && error.code === "UNAUTHORIZED") {
    return { status: 401, message: "Firebase authentication failed." };
  }
  return {
    status: 500,
    message: "Authentication service is temporarily unavailable."
  };
}
```

In both auth routes, replace the raw `stringifyUnknownError` catch response with:

```ts
const publicError = getAuthRouteError(error);
return NextResponse.json(
  { ok: false, error: publicError.message },
  { status: publicError.status }
);
```

Remove unused `stringifyUnknownError` and `AIProviderError` imports from the routes.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit the error boundary**

```powershell
git add src/lib/auth/auth-route-error.ts app/api/auth/login/route.ts app/api/auth/session/route.ts tests/api-access-control.test.ts
git commit -m "fix: harden Firebase auth route errors"
```

### Task 2: Firebase Lookup Failure Normalization

**Files:**
- Modify: `src/lib/firebase/firebase-server-auth.ts`
- Test: `tests/api-access-control.test.ts`

**Interfaces:**
- Produces: `verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser>` whose rejected user tokens always surface as `AIProviderError` with `code: "UNAUTHORIZED"` and `status: 401`.

- [ ] **Step 1: Write failing lookup tests**

Extend the Firebase lookup test to assert the thrown structured error for a 400 response and to assert that a non-JSON 502 response is not treated as an authentication failure.

```ts
globalThis.fetch = async () =>
  new Response(JSON.stringify({ error: { message: "INVALID_ID_TOKEN" } }), {
    status: 400,
    headers: { "Content-Type": "application/json" }
  });
await assert.rejects(
  () => verifyFirebaseIdToken("invalid-token"),
  (error: unknown) =>
    error instanceof AIProviderError &&
    error.code === "UNAUTHORIZED" &&
    error.status === 401
);
```

For the 502 response, assert rejection without accepting an `UNAUTHORIZED` error.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: the 400 lookup error carries status 400 and the non-JSON response throws JSON parsing before explicit classification.

- [ ] **Step 3: Implement response-safe normalization**

Read Firebase JSON with `await response.json().catch(() => ({}))`. If the upstream response is a 4xx or the successful response lacks uid/email, throw `AIProviderError` with `code: "UNAUTHORIZED"` and `status: 401`. If the upstream response is 5xx, throw a regular `Error("Firebase authentication service unavailable.")` so the route boundary returns a safe 500.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit lookup normalization**

```powershell
git add src/lib/firebase/firebase-server-auth.ts tests/api-access-control.test.ts
git commit -m "fix: normalize Firebase token verification failures"
```

### Task 3: Provider-Aware Firebase Client Errors

**Files:**
- Modify: `src/lib/firebase/firebase-auth-errors.ts`
- Modify: `components/auth/AuthGate.tsx`
- Test: `tests/auth-and-ui-contract.test.ts`

**Interfaces:**
- Produces: `FirebaseAuthMethod = "password" | "google" | "github" | "generic"`.
- Produces: `getFirebaseAuthErrorMessage(error: unknown, method?: FirebaseAuthMethod): string`.

- [ ] **Step 1: Write failing provider-copy tests**

Replace the single invalid-credential assertion with these explicit cases:

```ts
assert.match(
  getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "password"),
  /이메일 또는 비밀번호/u
);
assert.match(
  getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "google"),
  /Google 로그인 정보/u
);
assert.doesNotMatch(
  getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "google"),
  /비밀번호/u
);
```

Add source assertions that password, Google, and GitHub actions pass their matching method to `getAuthActionError`.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test`

Expected: the mapper accepts only one argument and Google still receives email/password copy.

- [ ] **Step 3: Implement provider-aware messages**

Keep `auth/user-not-found` and `auth/wrong-password` as password-only copy. Handle `auth/invalid-credential` before the shared map:

```ts
if (code === "auth/invalid-credential") {
  if (method === "google") {
    return "Google 로그인 정보가 유효하지 않습니다. Google 계정을 다시 선택해주세요.";
  }
  if (method === "github") {
    return "GitHub 로그인 정보가 유효하지 않습니다. GitHub 로그인을 다시 시도해주세요.";
  }
  if (method === "password") {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }
  return "로그인 정보가 유효하지 않습니다. 다시 로그인해주세요.";
}
```

Change `getAuthActionError(error, method)` in `AuthGate` and pass `"password"`, `"google"`, or `"github"` from the matching action. Preserve `AuthSessionError` messages without remapping.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 5: Commit provider-aware errors**

```powershell
git add src/lib/firebase/firebase-auth-errors.ts components/auth/AuthGate.tsx tests/auth-and-ui-contract.test.ts
git commit -m "fix: distinguish social login errors"
```

### Task 4: Production Secret Recovery and Verification

**Files:**
- Modify only in Railway: `AUTH_SESSION_SECRET`
- Verify only: `.env.example`
- Verify only: `docs/authentication.md`

**Interfaces:**
- Requires: a cryptographically random production-only value with at least 32 bytes.
- Preserves: no repository or browser exposure of the generated value.

- [ ] **Step 1: Generate and set the Railway variable without printing it**

Use Railway's variable editor or an authenticated Railway CLI session to set a freshly generated 64-hex-character value as `AUTH_SESSION_SECRET`. Do not reuse `.env.local`; redeploy the web service after the variable changes.

- [ ] **Step 2: Verify invalid-token classification on production**

Send `{ "idToken": "invalid-test-token" }` to both auth routes.

Expected: both return HTTP 401 with a generic Firebase authentication failure, never 500.

- [ ] **Step 3: Verify a valid token without retaining test data**

Create a disposable Firebase email/password user, call `/api/auth/session`, and delete the Firebase user in `finally`.

Expected: HTTP 200, a hardened `dreamwish-session` cookie, and successful test-user deletion.

- [ ] **Step 4: Verify Google manually in the production UI**

Open `https://dreamwish.co.kr`, select Google, complete the popup, and confirm the application session becomes authenticated. If Firebase rejects the popup, the message must mention Google login information and must not mention an email password.

- [ ] **Step 5: Run complete repository verification**

Run: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.

Expected: all tests pass, TypeScript and lint exit 0, production build succeeds, and no whitespace errors are reported.

- [ ] **Step 6: Commit documentation only if it changed**

```powershell
git add .env.example docs/authentication.md docs/superpowers/plans/2026-07-13-auth-session-and-google-login-recovery.md
git commit -m "docs: record production auth recovery"
```
