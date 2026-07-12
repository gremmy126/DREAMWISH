# Login Page Redesign and Authentication Resilience Design

## Goal

Redesign the unauthenticated DREAMWISH experience as a calm, premium personal-AI SaaS login page while preserving the existing Firebase identity flow, account/payment gate, and signed application session. The result must keep login focused, work naturally on desktop and mobile, expose actionable validation and authentication errors, and add no new UI library.

## Current state and evidence

- `components/auth/AuthGate.tsx` currently owns session restoration, email/password login, sign-up, password reset, Google login, GitHub login, the paid-access gate, and password change. Its unauthenticated shell is a single centered card.
- Browser identity is established by Firebase. Every successful provider returns a Firebase ID token, which is posted to `/api/auth/login`; the server verifies the canonical Firebase user, updates the existing account record, and sets the existing signed `HttpOnly` session cookie.
- Local Firebase public configuration and the server-only session secret are present without exposing their values. The current 180-test suite passes.
- The deployed root page and `/api/auth/login` are reachable. A request without an ID token is rejected with the expected `401` response. A valid-account post-Firebase failure cannot be reproduced without user credentials, so the implementation will not replace or guess at the server authentication architecture.
- The deployed page currently omits GitHub when `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN` is not enabled. The component will preserve this browser-safe provider gate; provider console and Railway configuration remain operational requirements.

## Scope

### In scope

- Replace the unauthenticated `LoginShell` visual hierarchy and interaction design.
- Split the large authentication file at the presentation boundary without moving authentication state or network effects out of `AuthGate`.
- Add deterministic client-side email and password validation, field-level errors, accessible status messaging, and form submission with the Enter key.
- Preserve sign-in, sign-up, password reset, Google, GitHub, session restoration, payment gating, logout, and authenticated password change.
- Improve classification and wording of client-visible server-session failures without exposing configuration details.
- Add focused tests and responsive browser verification.

### Out of scope

- Replacing Firebase Authentication or the signed application session.
- Adding `firebase-admin`, a new component library, a form library, or an animation library.
- Changing the account repository, payment rules, middleware access policy, or OAuth integration connectors.
- Creating a second independent login state machine under `/login`.
- Changing Firebase Console, GitHub OAuth App, or Railway variables from repository code.

## Recommended architecture

`AuthGate` remains the controller and the only owner of authentication effects. It continues to call the existing Firebase client helpers, obtain ID tokens, call `/api/auth/login` and `/api/auth/session`, and transition between unauthenticated, payment-required, and authorized application states.

The unauthenticated presentation moves to a focused `components/auth/LoginShell.tsx` component. It receives values, provider availability, status messages, and callbacks through explicit props. It may own presentation-only state such as touched fields and password visibility, but it must not call Firebase or authentication APIs directly.

A small pure helper in `src/lib/auth/login-form-validation.ts` validates email and password input. Keeping validation independent from React makes the rules deterministic and testable with the existing Node test runner. The helper returns field-specific Korean messages and supports sign-in, sign-up, and password-reset intents.

This boundary keeps authentication behavior stable while making the visual layer replaceable and preventing the already-large `AuthGate.tsx` from absorbing another full page of decorative markup.

## Authentication data flow

### Email sign-in and sign-up

1. The form validates trimmed email and password locally.
2. Invalid input stays in the browser, marks the relevant field with `aria-invalid`, and shows a concise field message.
3. Valid sign-in calls the existing `signInWithFirebasePassword`; valid sign-up calls `createFirebasePasswordAccount` with the optional display name.
4. The Firebase credential supplies an ID token.
5. `AuthGate` posts only the ID token to `/api/auth/login`.
6. The server verifies canonical Firebase identity, updates the existing account record, creates the existing signed session, and sets the hardened cookie.
7. The existing access state decides whether to show the application or payment-required shell.

### Google and GitHub

Google and enabled GitHub buttons continue to call the existing Firebase popup helpers. They share the same ID-token exchange and duplicate-submit guard as email sign-in. GitHub remains visible only when the existing public enable flag makes its callback available; secrets remain in Firebase/GitHub configuration and never enter the browser bundle.

### Password reset

The “비밀번호 찾기” control validates the currently entered email before calling the existing Firebase reset helper. Success and failure messages appear in one stable status area without moving the form unexpectedly.

### Session restoration

Session restoration remains Firebase-user-first. Local storage is only a display cache and never establishes identity. A fresh Firebase ID token is still mandatory for `/api/auth/session`.

## Desktop layout

At the `lg` breakpoint and above, the page uses an approximately `55% / 45%` two-column layout and fills the dynamic viewport height.

The left brand panel uses a white-to-slate base with restrained violet and blue radial gradients. It contains:

- the DREAMWISH mark and “개인두뇌 AI” product identity;
- the headline “당신의 지식과 업무를 하나로 연결하세요”;
- the supplied one-sentence product description;
- exactly three feature statements using `Network`, `CalendarCheck`, and `ShieldCheck` or closely matching Lucide icons;
- an abstract knowledge-work network made from thin SVG lines, small circular nodes, and a few lightweight cards representing notes, schedules, work, and AI.

The illustration must not depict a literal brain, dense neural imagery, a stock photo, or a large block of copy. Low-amplitude Framer Motion transitions may move nodes or cards by a few pixels and fade the panel in. Motion respects reduced-motion preferences.

The right panel centers a white login card with a width between 420 and 460 pixels, generous padding, a subtle border, rounded corners, and a restrained shadow. The surrounding background stays bright and quiet so the card remains the primary task.

## Mobile layout

Below `lg`, the full network illustration and feature list are removed from the reading order. A compact brand row and short product label remain above the card so the page still feels branded. The form is centered with safe horizontal padding, supports narrow 320-pixel screens, uses `min-h-dvh`, and does not create horizontal scrolling.

The primary action and provider buttons remain at least 44 pixels high. Spacing reduces slightly on small screens without compressing labels, messages, or touch targets.

## Login card and interaction hierarchy

The sign-in mode follows this order:

1. “다시 오신 것을 환영합니다” and “계정에 로그인하고 작업을 계속하세요.”
2. Email field with a visible label, `Mail` icon, `type="email"`, `name="email"`, `autoComplete="email"`, and `name@example.com` placeholder.
3. Password field with a visible label, `LockKeyhole` icon, `type="password"`, `name="password"`, and `autoComplete="current-password"`.
4. A compact auxiliary row containing “비밀번호 찾기”. This satisfies the requested login-state/auxiliary step without adding a misleading persistence checkbox; Firebase already owns persistence behavior.
5. Primary login button with a clear loading state.
6. A labelled divider.
7. Google and, when enabled, GitHub provider buttons.
8. A sign-up prompt that switches the existing mutually exclusive mode.
9. A small `ShieldCheck` security note explaining encrypted connection and protected session handling.

Sign-up mode reuses the same card and callbacks. It changes the title and action copy, exposes the existing optional name field, switches password autocomplete to `new-password`, and explains the six-character minimum. Switching modes clears stale validation and server status messages but does not trigger network activity.

## Validation and error handling

Email validation distinguishes an empty value from a malformed address. Password validation distinguishes an empty value and, during sign-up, a value shorter than six characters. The implementation intentionally avoids an over-restrictive email expression; it checks a trimmed local part, `@`, and domain shape while Firebase remains authoritative.

Every invalid field receives:

- a red but restrained border and focus ring;
- `aria-invalid="true"`;
- `aria-describedby` pointing to its message;
- a concise Korean message directly below the field.

Firebase/provider errors remain mapped through `getFirebaseAuthErrorMessage`. Server-session responses are grouped into unauthorized input/session failures, temporary server authentication failures, and safe generic failures. Configuration names, raw upstream responses, tokens, and secret values are never displayed. The shared alert uses `role="alert"` and `aria-live="polite"`; password-reset success uses a non-error status treatment.

Submitting state disables every authentication action and preserves the existing duplicate-request protection. A spinner has accompanying text so loading is not conveyed by animation alone.

## Visual language

- Base: white, slate-50, and soft gray borders.
- Accent: existing DREAMWISH violet with a restrained blue secondary glow.
- Typography: current system/Inter-compatible stack; no font dependency is added.
- Surfaces: opaque white cards, no heavy glassmorphism, no saturated full-screen gradient.
- Icons: only a small set of Lucide icons with consistent 16–20 pixel sizing.
- Motion: short entrance transitions and subtle background drift only; no looping attention-grabbing form animation.
- Focus: visible keyboard rings with sufficient contrast on every interactive control.

## Testing strategy

Implementation follows test-first cycles:

1. Add failing unit tests for empty email, malformed email, valid trimmed email, empty password, short sign-up password, and reset-email validation.
2. Add failing UI contract tests for the two-column structure, Korean heading, semantic form, required input attributes, field-error accessibility, Google/GitHub controls, security note, and provider/loading guards.
3. Implement the smallest validation helper and presentation component needed to pass those tests.
4. Run the focused authentication tests, then the full test suite, typecheck, lint, and production build.
5. Start the application and verify the unauthenticated page in the browser at desktop, tablet, and mobile viewport widths. Check layout, overflow, focus, disabled/loading states, validation errors, sign-up switching, and reduced-motion behavior without using real credentials.

## Acceptance criteria

- Desktop presents a stable 55/45 brand-and-login layout with a restrained network illustration.
- Mobile presents a centered login experience with compact branding and no horizontal overflow.
- The card stays within 420–460 pixels on desktop and fits narrow mobile screens.
- Email and password have persistent labels, correct input types/names/autocomplete, visible focus, and separate empty/format errors.
- Enter submits the form after validation.
- Password reset, Google, configured GitHub, sign-up switching, and existing auth callbacks remain wired.
- Provider and server errors are actionable, accessible, and do not reveal raw secrets or tokens.
- Firebase ID-token verification, server session cookies, account/payment rules, session restoration, and password-change behavior remain unchanged.
- No new runtime dependency is added.
- Focused tests, full tests, typecheck, lint, build, and responsive browser checks complete successfully before commit and push.
