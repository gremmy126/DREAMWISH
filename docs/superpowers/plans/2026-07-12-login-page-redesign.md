# Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern, accessible 55/45 DREAMWISH login experience with deterministic field validation and safe authentication-session errors while preserving the existing Firebase-to-signed-session flow.

**Architecture:** Keep `AuthGate` as the only authentication controller and extract its unauthenticated presentation into a focused `LoginShell`. Add pure validation and session-error helpers under `src/lib/auth` so behavior is testable with the existing Node runner. The new component uses the installed Tailwind CSS, Lucide, and Framer Motion stack without adding dependencies.

**Tech Stack:** Next.js 15.3, React 19.1, TypeScript 5.7, Tailwind CSS 3.4, Firebase 12.16, lucide-react 0.468, framer-motion 12.23, Node assertion-based tests.

## Global Constraints

- Preserve Firebase email/password, sign-up, password reset, Google, configured GitHub, ID-token exchange, session restoration, payment gating, logout, and password change.
- Preserve `/api/auth/login` and `/api/auth/session` as ID-token-only boundaries; local storage never establishes identity.
- Desktop uses an approximately 55% brand panel and 45% login panel; mobile removes the full illustration and centers the form.
- The desktop card remains between 420 and 460 pixels wide and fits 320-pixel mobile screens without horizontal scrolling.
- Use no new UI, form, animation, authentication, or testing dependency.
- Do not expose Firebase tokens, upstream responses, environment-variable values, or session-secret details.
- GitHub remains controlled by `NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN`; repository code does not change external provider consoles or Railway variables.
- Every production behavior is introduced through a failing test first.

---

## File structure

- Create `src/lib/auth/login-form-validation.ts`: pure login and reset validation, with no React or Firebase dependency.
- Create `src/lib/auth/auth-session-errors.ts`: pure mapping from HTTP status to safe Korean session messages.
- Create `components/auth/LoginShell.tsx`: presentational unauthenticated page, local touched/error UI, and callback invocation only.
- Create `tests/login-page-redesign.test.ts`: validation and source-contract coverage for the new presentation boundary.
- Modify `components/auth/AuthGate.tsx`: retain effects/state, import the extracted shell, clear stale mode state, and use safe session-error mapping.
- Modify `tests/auth-and-ui-contract.test.ts`: preserve existing authentication wiring contracts after extraction.
- Verify only `app/globals.css`, `tailwind.config.ts`, `package.json`, and `package-lock.json`; they should not need changes.

---

### Task 1: Deterministic Login Validation

**Files:**
- Create: `tests/login-page-redesign.test.ts`
- Create: `src/lib/auth/login-form-validation.ts`

**Interfaces:**
- Produces: `type LoginMode = "signin" | "signup"`
- Produces: `type LoginFieldErrors = { email?: string; password?: string }`
- Produces: `validateLoginForm(input: { email: string; password: string; mode: LoginMode }): LoginFieldErrors`
- Produces: `validatePasswordResetEmail(email: string): string | null`

- [ ] **Step 1: Write a failing existence and behavior test**

Create `tests/login-page-redesign.test.ts` with the missing-module guard before `require` so RED is an assertion failure rather than a loader crash:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";

test("login form validation distinguishes empty malformed and valid input", () => {
  assert.equal(fs.existsSync("src/lib/auth/login-form-validation.ts"), true);
  const { validateLoginForm, validatePasswordResetEmail } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    validateLoginForm: (input: {
      email: string;
      password: string;
      mode: "signin" | "signup";
    }) => { email?: string; password?: string };
    validatePasswordResetEmail: (email: string) => string | null;
  };

  assert.deepEqual(validateLoginForm({ email: "", password: "", mode: "signin" }), {
    email: "이메일을 입력해주세요.",
    password: "비밀번호를 입력해주세요."
  });
  assert.deepEqual(
    validateLoginForm({ email: "wrong-address", password: "secret1", mode: "signin" }),
    { email: "올바른 이메일 주소를 입력해주세요." }
  );
  assert.deepEqual(
    validateLoginForm({ email: " name@example.com ", password: "secret1", mode: "signin" }),
    {}
  );
  assert.deepEqual(
    validateLoginForm({ email: "name@example.com", password: "12345", mode: "signup" }),
    { password: "비밀번호는 6자 이상이어야 합니다." }
  );
  assert.equal(validatePasswordResetEmail(""), "비밀번호를 재설정할 이메일을 입력해주세요.");
  assert.equal(
    validatePasswordResetEmail("wrong-address"),
    "올바른 이메일 주소를 입력해주세요."
  );
  assert.equal(validatePasswordResetEmail(" name@example.com "), null);
});
```

- [ ] **Step 2: Run the suite and confirm RED**

Run: `npm.cmd test`

Expected: exactly the new test fails because `src/lib/auth/login-form-validation.ts` does not exist; the existing 180 tests remain registered.

- [ ] **Step 3: Implement the pure helper**

Create `src/lib/auth/login-form-validation.ts`:

```ts
export type LoginMode = "signin" | "signup";

export type LoginFieldErrors = {
  email?: string;
  password?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateLoginForm(input: {
  email: string;
  password: string;
  mode: LoginMode;
}): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const email = input.email.trim();

  if (!email) errors.email = "이메일을 입력해주세요.";
  else if (!EMAIL_PATTERN.test(email)) {
    errors.email = "올바른 이메일 주소를 입력해주세요.";
  }

  if (!input.password) errors.password = "비밀번호를 입력해주세요.";
  else if (input.mode === "signup" && input.password.length < 6) {
    errors.password = "비밀번호는 6자 이상이어야 합니다.";
  }

  return errors;
}

export function validatePasswordResetEmail(email: string): string | null {
  const value = email.trim();
  if (!value) return "비밀번호를 재설정할 이메일을 입력해주세요.";
  if (!EMAIL_PATTERN.test(value)) return "올바른 이메일 주소를 입력해주세요.";
  return null;
}
```

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: 181 tests pass and zero tests fail.

- [ ] **Step 5: Commit the validation unit**

```powershell
git add -- tests/login-page-redesign.test.ts src/lib/auth/login-form-validation.ts
git commit -m "test: define login validation behavior"
```

---

### Task 2: Premium Responsive Login Presentation

**Files:**
- Modify: `tests/login-page-redesign.test.ts`
- Create: `components/auth/LoginShell.tsx`

**Interfaces:**
- Consumes: `validateLoginForm` and `validatePasswordResetEmail` from Task 1.
- Produces: `export type LoginShellProps` with the same value and callback surface currently passed by `AuthGate`.
- Produces: `export function LoginShell(props: LoginShellProps): JSX.Element`.

- [ ] **Step 1: Add a failing source-contract test**

Append this test to `tests/login-page-redesign.test.ts`:

```ts
test("login shell provides the approved responsive accessible SaaS layout", () => {
  assert.equal(fs.existsSync("components/auth/LoginShell.tsx"), true);
  const source = fs.readFileSync("components/auth/LoginShell.tsx", "utf8");

  for (const contract of [
    /lg:grid-cols-\[55fr_45fr\]/u,
    /max-w-\[440px\]/u,
    /당신의 지식과 업무를 하나로 연결하세요/u,
    /다시 오신 것을 환영합니다/u,
    /계정에 로그인하고 작업을 계속하세요/u,
    /<form/u,
    /onSubmit=/u,
    /id="email"/u,
    /name="email"/u,
    /type="email"/u,
    /autoComplete="email"/u,
    /placeholder="name@example.com"/u,
    /id="password"/u,
    /name="password"/u,
    /autoComplete=\{creatingAccount \? "new-password" : "current-password"\}/u,
    /aria-invalid/u,
    /aria-describedby/u,
    /role="alert"/u,
    /aria-live="polite"/u,
    /Google로 계속하기/u,
    /GitHub로 계속하기/u,
    /안전하게 보호됩니다/u,
    /useReducedMotion/u,
    /motion\./u
  ]) {
    assert.match(source, contract);
  }

  for (const icon of ["Mail", "LockKeyhole", "Network", "CalendarCheck", "ShieldCheck"]) {
    assert.match(source, new RegExp(`\\b${icon}\\b`, "u"));
  }
});
```

- [ ] **Step 2: Run the suite and confirm RED**

Run: `npm.cmd test`

Expected: the layout test fails because `components/auth/LoginShell.tsx` does not exist.

- [ ] **Step 3: Create the prop contract and form behavior**

Create `components/auth/LoginShell.tsx` with this public type and event flow:

```tsx
"use client";

import {
  CalendarCheck,
  Chrome,
  Github,
  Loader2,
  LockKeyhole,
  Mail,
  Network,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useState, type FormEvent, type ReactNode } from "react";
import {
  validateLoginForm,
  validatePasswordResetEmail,
  type LoginFieldErrors
} from "@/src/lib/auth/login-form-validation";

export type LoginShellProps = {
  email: string;
  name: string;
  password: string;
  error: string | null;
  resetMessage: string | null;
  submitting: boolean;
  creatingAccount: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onSignup: () => void;
  onModeChange: (value: boolean) => void;
  onResetPassword: () => void;
  onGoogle: () => void;
  onGithub?: () => void;
};

export function LoginShell(props: LoginShellProps) {
  const {
    email,
    name,
    password,
    error,
    resetMessage,
    submitting,
    creatingAccount,
    onEmailChange,
    onPasswordChange,
    onNameChange,
    onSubmit,
    onSignup,
    onModeChange,
    onResetPassword,
    onGoogle,
    onGithub
  } = props;
  const reduceMotion = useReducedMotion();
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLoginForm({
      email,
      password,
      mode: creatingAccount ? "signup" : "signin"
    });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (creatingAccount) onSignup();
    else onSubmit();
  }

  function handleResetPassword() {
    const emailError = validatePasswordResetEmail(email);
    setFieldErrors((current) => ({ ...current, email: emailError || undefined }));
    if (!emailError) onResetPassword();
  }

  function handleModeChange() {
    setFieldErrors({});
    onModeChange(!creatingAccount);
  }

  return (
    <main className="min-h-dvh bg-white">
      <form noValidate onSubmit={handleSubmit}>
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
        />
        {fieldErrors.email ? <p>{fieldErrors.email}</p> : null}
        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={creatingAccount ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
        {fieldErrors.password ? <p>{fieldErrors.password}</p> : null}
        <button type="button" onClick={handleResetPassword}>비밀번호 찾기</button>
        <button type="submit">{creatingAccount ? "계정 만들기" : "로그인"}</button>
        <button type="button" onClick={handleModeChange}>모드 전환</button>
        <button type="button" onClick={onGoogle}>Google로 계속하기</button>
        {onGithub ? <button type="button" onClick={onGithub}>GitHub로 계속하기</button> : null}
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Add the complete approved layout**

Implement the returned hierarchy with no omitted sections:

```tsx
return (
  <main className="grid min-h-dvh overflow-hidden bg-white lg:grid-cols-[55fr_45fr]">
    <BrandPanel reduceMotion={Boolean(reduceMotion)} />
    <section className="flex min-h-dvh items-center justify-center bg-slate-50/80 px-4 py-8 sm:px-8 lg:px-10">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-[440px]"
      >
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <BrandMark />
          <div>
            <p className="text-sm font-bold tracking-tight text-slate-950">DREAMWISH</p>
            <p className="text-xs font-medium text-slate-500">개인두뇌 AI</p>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200/90 bg-white p-6 shadow-[0_24px_70px_rgba(15,23,42,0.09)] sm:p-8">
          <header>
            <p className="text-sm font-semibold text-violet-600">
              {creatingAccount ? "새로운 워크스페이스" : "개인두뇌 AI에 로그인"}
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">
              {creatingAccount ? "계정을 만들어 시작하세요" : "다시 오신 것을 환영합니다"}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {creatingAccount
                ? "하나의 계정으로 지식과 업무 흐름을 연결하세요."
                : "계정에 로그인하고 작업을 계속하세요."}
            </p>
          </header>

          <form className="mt-7" noValidate onSubmit={handleSubmit}>
            <div className="space-y-5">
              <LoginField
                id="email"
                name="email"
                label="이메일"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                icon={<Mail aria-hidden="true" size={18} />}
                value={email}
                error={fieldErrors.email}
                onChange={(value) => {
                  onEmailChange(value);
                  setFieldErrors((current) => ({ ...current, email: undefined }));
                }}
              />
              <LoginField
                id="password"
                name="password"
                label="비밀번호"
                type="password"
                autoComplete={creatingAccount ? "new-password" : "current-password"}
                placeholder={creatingAccount ? "6자 이상 입력하세요" : "비밀번호를 입력하세요"}
                icon={<LockKeyhole aria-hidden="true" size={18} />}
                value={password}
                error={fieldErrors.password}
                onChange={(value) => {
                  onPasswordChange(value);
                  setFieldErrors((current) => ({ ...current, password: undefined }));
                }}
              />
              {creatingAccount ? (
                <LoginField
                  id="name"
                  name="name"
                  label="이름 (선택)"
                  type="text"
                  autoComplete="name"
                  placeholder="이름을 입력하세요"
                  icon={<UserRound aria-hidden="true" size={18} />}
                  value={name}
                  onChange={onNameChange}
                />
              ) : null}
            </div>

            {!creatingAccount ? (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={submitting}
                  className="rounded-lg px-1 py-1 text-xs font-semibold text-violet-600 outline-none transition hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  비밀번호 찾기
                </button>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-500">비밀번호는 6자 이상 입력해주세요.</p>
            )}

            <AuthStatus error={error} resetMessage={resetMessage} />

            <button
              type="submit"
              disabled={submitting}
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)] outline-none transition hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            >
              {submitting ? <Loader2 aria-hidden="true" className="animate-spin" size={17} /> : <ShieldCheck aria-hidden="true" size={17} />}
              {submitting ? "로그인 확인 중" : creatingAccount ? "계정 만들기" : "로그인"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3" aria-label="소셜 로그인 구분">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">또는</span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="space-y-3">
            <ProviderButton icon={<Chrome aria-hidden="true" size={18} />} label="Google로 계속하기" disabled={submitting} onClick={onGoogle} />
            {onGithub ? <ProviderButton icon={<Github aria-hidden="true" size={18} />} label="GitHub로 계속하기" disabled={submitting} onClick={onGithub} /> : null}
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">
            {creatingAccount ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}{" "}
            <button type="button" onClick={handleModeChange} disabled={submitting} className="font-bold text-violet-600 outline-none hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-50">
              {creatingAccount ? "로그인" : "회원가입"}
            </button>
          </p>
        </div>

        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500">
          <ShieldCheck aria-hidden="true" size={14} className="text-emerald-600" />
          인증 정보와 세션은 암호화된 연결로 안전하게 보호됩니다.
        </p>
      </motion.div>
    </section>
  </main>
);
```

Add these complete focused private components below `LoginShell`:

```tsx
function BrandPanel({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <section className="relative hidden min-h-dvh overflow-hidden border-r border-slate-200/70 bg-gradient-to-br from-white via-violet-50/60 to-blue-50/70 lg:flex">
      <div className="absolute -left-24 top-12 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl" />
      <div className="absolute bottom-8 right-0 h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
      <div className="relative z-10 mx-auto flex w-full max-w-[760px] flex-col px-12 py-10 xl:px-16 xl:py-12">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="text-sm font-extrabold tracking-tight text-slate-950">DREAMWISH</p>
            <p className="text-xs font-semibold text-slate-500">개인두뇌 AI</p>
          </div>
        </div>

        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mt-16 max-w-[620px]"
        >
          <p className="text-sm font-bold text-violet-600">Personal Knowledge OS</p>
          <h2 className="mt-4 text-4xl font-bold leading-[1.18] tracking-[-0.035em] text-slate-950 xl:text-[46px]">
            당신의 지식과 업무를
            <br />
            하나로 연결하세요
          </h2>
          <p className="mt-5 max-w-[560px] text-base leading-7 text-slate-600">
            메모, 일정, 고객, 프로젝트와 AI를 한곳에서 관리하는 개인 업무 운영체제입니다.
          </p>
        </motion.div>

        <div className="mt-9 grid max-w-[590px] gap-3">
          <FeatureItem
            icon={<Network aria-hidden="true" size={18} />}
            title="대화와 문서를 연결하는 지식 시스템"
          />
          <FeatureItem
            icon={<CalendarCheck aria-hidden="true" size={18} />}
            title="일정과 업무를 실행하는 AI 비서"
          />
          <FeatureItem
            icon={<ShieldCheck aria-hidden="true" size={18} />}
            title="개인정보를 우선하는 안전한 설계"
          />
        </div>

        <KnowledgeNetwork reduceMotion={reduceMotion} />
      </div>
    </section>
  );
}

function BrandMark() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-[0_10px_28px_rgba(109,93,246,0.24)]">
      <Sparkles aria-hidden="true" size={20} />
    </span>
  );
}

function FeatureItem({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/75 px-4 py-3 text-sm font-semibold text-slate-700 shadow-[0_8px_30px_rgba(15,23,42,0.04)]">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
        {icon}
      </span>
      <span>{title}</span>
    </div>
  );
}

function KnowledgeNetwork({ reduceMotion }: { reduceMotion: boolean }) {
  const floatPrimary = reduceMotion ? undefined : { y: [0, -6, 0] };
  const floatSecondary = reduceMotion ? undefined : { y: [0, 5, 0] };

  return (
    <div className="relative mt-auto h-[250px] max-w-[620px]" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 620 250" fill="none">
        <path d="M96 166L230 92L372 146L520 70" stroke="#C4B5FD" strokeWidth="1.3" />
        <path d="M96 166L252 206L372 146L528 184" stroke="#BFDBFE" strokeWidth="1.3" />
        <path d="M230 92L252 206" stroke="#DDD6FE" strokeWidth="1" strokeDasharray="5 7" />
        <circle cx="96" cy="166" r="5" fill="#8B5CF6" />
        <circle cx="230" cy="92" r="5" fill="#6366F1" />
        <circle cx="252" cy="206" r="4" fill="#60A5FA" />
        <circle cx="372" cy="146" r="6" fill="#7C3AED" />
        <circle cx="520" cy="70" r="4" fill="#3B82F6" />
        <circle cx="528" cy="184" r="4" fill="#818CF8" />
      </svg>

      <motion.div
        animate={floatPrimary}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[12%] top-[48%] flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-[0_14px_38px_rgba(76,29,149,0.10)]"
      >
        <Network size={15} className="text-violet-600" /> 지식
      </motion.div>
      <motion.div
        animate={floatSecondary}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[51%] top-[43%] flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-[0_14px_38px_rgba(30,64,175,0.09)]"
      >
        <Workflow size={15} className="text-blue-600" /> 업무 흐름
      </motion.div>
      <motion.div
        animate={floatPrimary}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute right-[5%] top-[18%] flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-[0_14px_38px_rgba(30,64,175,0.09)]"
      >
        <CalendarCheck size={15} className="text-blue-600" /> 일정
      </motion.div>
      <motion.div
        animate={floatSecondary}
        transition={{ duration: 7.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[8%] right-[2%] flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-3 py-2 text-xs font-bold text-slate-700 shadow-[0_14px_38px_rgba(76,29,149,0.10)]"
      >
        <Sparkles size={15} className="text-violet-600" /> AI 연결
      </motion.div>
    </div>
  );
}

function LoginField({
  id,
  name,
  label,
  type,
  autoComplete,
  placeholder,
  icon,
  value,
  error,
  onChange
}: {
  id: string;
  name: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  placeholder: string;
  icon: ReactNode;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-700">
        {label}
      </label>
      <div className="relative">
        <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${error ? "text-red-500" : "text-slate-400"}`}>
          {icon}
        </span>
        <input
          id={id}
          name={name}
          type={type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 ${
            error
              ? "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-100"
              : "border-slate-200 hover:border-slate-300 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
          }`}
        />
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ProviderButton({
  icon,
  label,
  disabled,
  onClick
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none transition hover:border-slate-300 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      {icon}
      {label}
    </button>
  );
}

function AuthStatus({
  error,
  resetMessage
}: {
  error: string | null;
  resetMessage: string | null;
}) {
  if (error) {
    return (
      <p role="alert" aria-live="polite" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium leading-5 text-red-700">
        {error}
      </p>
    );
  }
  if (resetMessage) {
    return (
      <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-medium leading-5 text-emerald-700">
        {resetMessage}
      </p>
    );
  }
  return null;
}
```

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: 182 tests pass and zero tests fail.

- [ ] **Step 6: Run typecheck before integration**

Run: `npm.cmd run typecheck`

Expected: TypeScript exits 0; the standalone component and prop contract compile.

- [ ] **Step 7: Commit the presentation unit**

```powershell
git add -- components/auth/LoginShell.tsx tests/login-page-redesign.test.ts
git commit -m "feat: build premium login experience"
```

---

### Task 3: AuthGate Integration and Safe Session Errors

**Files:**
- Modify: `tests/login-page-redesign.test.ts`
- Modify: `tests/auth-and-ui-contract.test.ts`
- Create: `src/lib/auth/auth-session-errors.ts`
- Modify: `components/auth/AuthGate.tsx`

**Interfaces:**
- Consumes: `LoginShell` and `LoginShellProps` from Task 2.
- Produces: `getAuthSessionFailureMessage(status: number): string`.
- Preserves: existing `completeFirebaseLogin(idToken)` and `fetchAccess(idToken, fallback)` network boundaries.

- [ ] **Step 1: Add failing session-error tests**

Append to `tests/login-page-redesign.test.ts`:

```ts
test("auth session failures are stable Korean messages without server details", () => {
  assert.equal(fs.existsSync("src/lib/auth/auth-session-errors.ts"), true);
  const { getAuthSessionFailureMessage } = require(
    "../src/lib/auth/auth-session-errors"
  ) as { getAuthSessionFailureMessage: (status: number) => string };

  assert.equal(
    getAuthSessionFailureMessage(401),
    "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(429),
    "로그인 요청이 많습니다. 잠시 후 다시 시도해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(503),
    "로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(418),
    "로그인 처리를 완료하지 못했습니다. 다시 시도해주세요."
  );
});
```

- [ ] **Step 2: Add a failing extraction/wiring contract**

Append to `tests/login-page-redesign.test.ts`:

```ts
test("AuthGate delegates presentation and keeps Firebase auth effects", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  assert.match(source, /import \{ LoginShell \} from "@\/components\/auth\/LoginShell"/u);
  assert.match(source, /getAuthSessionFailureMessage/u);
  assert.match(source, /response\.json\(\)\.catch/u);
  assert.match(source, /function changeAuthMode/u);
  assert.doesNotMatch(source, /export function LoginShell/u);
  for (const preserved of [
    "signInWithFirebasePassword",
    "createFirebasePasswordAccount",
    "signInWithFirebaseGoogle",
    "signInWithFirebaseGithub",
    "sendFirebasePasswordReset",
    'fetch("/api/auth/login"',
    'fetch("/api/auth/session"'
  ]) {
    assert.match(source, new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});
```

Update the existing `tests/auth-and-ui-contract.test.ts` login UI tests so they read both `components/auth/AuthGate.tsx` and `components/auth/LoginShell.tsx`: authentication-effect assertions remain against `AuthGate`, while form/autocomplete/provider markup assertions move to `LoginShell`.

- [ ] **Step 3: Run the suite and confirm RED**

Run: `npm.cmd test`

Expected: the new helper and extraction assertions fail; existing authentication behavior tests still pass.

- [ ] **Step 4: Implement safe status mapping**

Create `src/lib/auth/auth-session-errors.ts`:

```ts
export function getAuthSessionFailureMessage(status: number): string {
  if (status === 401 || status === 403) {
    return "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요.";
  }
  if (status === 429) {
    return "로그인 요청이 많습니다. 잠시 후 다시 시도해주세요.";
  }
  if (status >= 500) {
    return "로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요.";
  }
  return "로그인 처리를 완료하지 못했습니다. 다시 시도해주세요.";
}
```

- [ ] **Step 5: Extract LoginShell and wire safe errors**

In `components/auth/AuthGate.tsx`:

1. Import `LoginShell` from `@/components/auth/LoginShell` and `getAuthSessionFailureMessage` from `@/src/lib/auth/auth-session-errors`.
2. Remove the old inline `LoginShell` function and the Lucide imports used only by it.
3. Keep every Firebase/client/server action in `AuthGate`.
4. Replace response parsing in `completeFirebaseLogin` with:

```ts
const data = (await response.json().catch(() => ({}))) as {
  access?: AccessState;
};
if (!response.ok || !data.access) {
  throw new AuthSessionError(getAuthSessionFailureMessage(response.status));
}
```

5. Replace response parsing in `fetchAccess` with the same safe `.catch(() => ({}))` pattern and status mapper. Keep the existing `fallback` for a successful response missing access only when `response.ok` is true:

```ts
if (!response.ok) throw new AuthSessionError(getAuthSessionFailureMessage(response.status));
if (!data.access) throw new AuthSessionError(fallback);
```

6. Add mode cleanup and pass it to the new shell:

```ts
function changeAuthMode(nextCreatingAccount: boolean) {
  setCreatingAccount(nextCreatingAccount);
  setPassword("");
  setError(null);
  setResetMessage(null);
}
```

Use `onModeChange={changeAuthMode}`. Keep `onSubmit={login}`, `onSignup={signup}`, `onResetPassword={resetPassword}`, `onGoogle={loginWithGoogle}`, and the existing conditional GitHub callback unchanged.

- [ ] **Step 6: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: 184 tests pass and zero tests fail.

- [ ] **Step 7: Run static verification**

Run: `npm.cmd run typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `npm.cmd run lint`

Expected: exit 0 with no lint errors.

- [ ] **Step 8: Commit the integration unit**

```powershell
git add -- components/auth/AuthGate.tsx components/auth/LoginShell.tsx src/lib/auth/auth-session-errors.ts tests/auth-and-ui-contract.test.ts tests/login-page-redesign.test.ts
git commit -m "fix: harden login session experience"
```

---

### Task 4: Full Verification and Responsive QA

**Files:**
- Verify: `components/auth/AuthGate.tsx`
- Verify: `components/auth/LoginShell.tsx`
- Verify: `src/lib/auth/login-form-validation.ts`
- Verify: `src/lib/auth/auth-session-errors.ts`
- Verify: `tests/login-page-redesign.test.ts`
- Verify: `tests/auth-and-ui-contract.test.ts`
- Verify: `docs/superpowers/specs/2026-07-12-login-page-redesign-design.md`
- Verify: `docs/superpowers/plans/2026-07-12-login-page-redesign.md`

**Interfaces:**
- Consumes: all deliverables from Tasks 1–3.
- Produces: verified local `main` commits ready for the controller's final whole-change review and explicit push.

- [ ] **Step 1: Verify the scoped diff and dependency boundary**

Run:

```powershell
git status -sb
git diff --check
git diff --stat origin/main...HEAD
git diff -- package.json package-lock.json
```

Expected: only the design/plan, two auth helpers, the extracted shell, `AuthGate`, and two test files differ; dependency files have no diff; `git diff --check` exits 0.

- [ ] **Step 2: Run the full automated verification suite**

Run each command fresh:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: all tests pass, typecheck exits 0, lint exits 0, and the Next.js production build exits 0.

- [ ] **Step 3: Start the local application for browser QA**

Start `npm.cmd run dev` in a hidden background process, wait for `http://127.0.0.1:3100` to return HTTP 200, and reuse the in-app browser. Do not enter real credentials.

- [ ] **Step 4: Verify desktop layout at 1440×1000**

Use the browser viewport capability to set 1440×1000, reload, dismiss only the consent banner if needed, and verify:

- computed grid columns are approximately 55/45;
- brand headline, description, exactly three feature rows, and abstract network are visible;
- card computed width is 440 pixels or less and at least 420 pixels where space permits;
- email/password labels and Google/configured-GitHub actions are visible;
- document width equals viewport width.

Capture a screenshot for visual inspection.

- [ ] **Step 5: Verify mobile layout at 390×844**

Set 390×844, reload, and verify:

- the full brand panel is hidden and compact branding is visible;
- the card fits within the viewport without horizontal overflow;
- every main/provider button is at least 44 pixels tall;
- labels and security copy remain readable.

Capture a screenshot for visual inspection.

- [ ] **Step 6: Verify interaction and accessibility without real credentials**

On the mobile or desktop page:

1. Submit the empty form and confirm both Korean field errors, `aria-invalid="true"`, and no network login attempt.
2. Enter `wrong-address` and confirm the format error.
3. Switch to sign-up and confirm the name field and `new-password` autocomplete.
4. Enter a five-character password and confirm the six-character message.
5. Confirm focus rings are visible by keyboard navigation and the alert/status regions exist.

- [ ] **Step 7: Restore viewport and stop the local server**

Clear the temporary viewport override, finalize temporary browser tabs, and terminate only the background process started in Step 3.

- [ ] **Step 8: Run final post-QA verification**

Run:

```powershell
git diff --check
git status -sb
git log -5 --oneline --decorate
```

Expected: no uncommitted code changes except the implementation plan if it has not yet been committed; no whitespace errors.

- [ ] **Step 9: Commit the implementation plan if needed**

```powershell
git add -- docs/superpowers/plans/2026-07-12-login-page-redesign.md
git commit -m "docs: plan login page redesign"
```

After the task review and final whole-change review are approved, the controller pushes explicitly to `https://github.com/gremmy126/DREAMWISH.git` with `main:main`, then compares `git ls-remote ... refs/heads/main` with `git rev-parse main`.
