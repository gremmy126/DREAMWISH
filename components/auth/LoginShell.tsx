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
import { useState, type FormEvent, type JSX, type ReactNode } from "react";
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

export function LoginShell(props: LoginShellProps): JSX.Element {
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
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  비밀번호는 6자 이상 입력해주세요.
                </p>
              )}

              <AuthStatus error={error} resetMessage={resetMessage} />

              <button
                type="submit"
                disabled={submitting}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-[0_10px_24px_rgba(124,58,237,0.22)] outline-none transition hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                {submitting ? (
                  <Loader2 aria-hidden="true" className="animate-spin" size={17} />
                ) : (
                  <ShieldCheck aria-hidden="true" size={17} />
                )}
                {submitting ? "로그인 확인 중" : creatingAccount ? "계정 만들기" : "로그인"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3" aria-label="소셜 로그인 구분">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                또는
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-3">
              <ProviderButton
                icon={<Chrome aria-hidden="true" size={18} />}
                label="Google로 계속하기"
                disabled={submitting}
                onClick={onGoogle}
              />
              {onGithub ? (
                <ProviderButton
                  icon={<Github aria-hidden="true" size={18} />}
                  label="GitHub로 계속하기"
                  disabled={submitting}
                  onClick={onGithub}
                />
              ) : null}
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
              {creatingAccount ? "이미 계정이 있으신가요?" : "아직 계정이 없으신가요?"}{" "}
              <button
                type="button"
                onClick={handleModeChange}
                disabled={submitting}
                className="font-bold text-violet-600 outline-none hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-50"
              >
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
}

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
          <h2
            aria-label="당신의 지식과 업무를 하나로 연결하세요"
            className="mt-4 text-4xl font-bold leading-[1.18] tracking-[-0.035em] text-slate-950 xl:text-[46px]"
          >
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
        <path
          d="M230 92L252 206"
          stroke="#DDD6FE"
          strokeWidth="1"
          strokeDasharray="5 7"
        />
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
        <span
          className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 ${
            error ? "text-red-500" : "text-slate-400"
          }`}
        >
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
      <p
        role="alert"
        aria-live="polite"
        className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium leading-5 text-red-700"
      >
        {error}
      </p>
    );
  }
  if (resetMessage) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-medium leading-5 text-emerald-700"
      >
        {resetMessage}
      </p>
    );
  }
  return null;
}
