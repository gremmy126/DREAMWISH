"use client";

import { Chrome, Github, Loader2, LockKeyhole, Mail, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode, type Ref } from "react";
import {
  decideLoginSubmission,
  decidePasswordReset,
  type LoginFieldErrors
} from "@/src/lib/auth/login-form-validation";

type LoginDialogProps = {
  open: boolean;
  email: string;
  name: string;
  password: string;
  error: string | null;
  resetMessage: string | null;
  submitting: boolean;
  creatingAccount: boolean;
  githubEnabled: boolean;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onSignup: () => void;
  onModeChange: (value: boolean) => void;
  onResetPassword: () => void;
  onGoogle: () => void;
  onGithub: () => void;
};

export function LoginDialog(props: LoginDialogProps) {
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const dialogRef = useRef<HTMLElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;

  useEffect(() => {
    if (!props.open) return;
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => emailInputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusableElements = getFocusableElements(dialogRef.current);
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const current = document.activeElement;
        if (event.shiftKey && (current === first || !dialogRef.current?.contains(current))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousActiveElement?.focus();
    };
  }, [props.open]);

  if (!props.open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const decision = decideLoginSubmission({
      email: props.email,
      password: props.password,
      mode: props.creatingAccount ? "signup" : "signin"
    });
    setFieldErrors(decision.fieldErrors);
    if (decision.action === "signup") props.onSignup();
    else if (decision.action === "signin") props.onSubmit();
  }

  function resetPassword() {
    const decision = decidePasswordReset(props.email);
    setFieldErrors((current) => ({ ...current, email: decision.emailError || undefined }));
    if (decision.action === "reset") props.onResetPassword();
  }

  function switchMode() {
    setFieldErrors({});
    props.onModeChange(!props.creatingAccount);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) props.onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        aria-describedby="login-dialog-description"
        className="max-h-full w-full max-w-[440px] overflow-y-auto rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.25)] sm:p-8"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-200">
              <Sparkles size={19} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">DREAMWISH</p>
              <h2 id="login-dialog-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                {props.creatingAccount ? "회원가입" : "로그인"}
              </h2>
            </div>
          </div>
          <button type="button" onClick={props.onClose} disabled={props.submitting} aria-label="로그인 창 닫기" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 disabled:opacity-40">
            <X size={18} />
          </button>
        </header>

        <p id="login-dialog-description" className="mt-4 text-sm leading-6 text-slate-500">
          {props.creatingAccount
            ? "계정을 만들면 나만의 기억과 업무 데이터를 AI가 안전하게 이어갑니다."
            : "로그인하면 이 화면에서 바로 나만의 AI와 대화를 시작할 수 있습니다."}
        </p>

        <form className="mt-6 space-y-4" noValidate onSubmit={submit}>
          <Field
            id="auth-email"
            label="이메일"
            type="email"
            autoComplete="email"
            value={props.email}
            placeholder="name@example.com"
            error={fieldErrors.email}
            icon={<Mail size={17} />}
            inputRef={emailInputRef}
            onChange={(value) => {
              props.onEmailChange(value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
          />
          <Field
            id="auth-password"
            label="비밀번호"
            type="password"
            autoComplete={props.creatingAccount ? "new-password" : "current-password"}
            value={props.password}
            placeholder={props.creatingAccount ? "6자 이상 입력하세요" : "비밀번호를 입력하세요"}
            error={fieldErrors.password}
            icon={<LockKeyhole size={17} />}
            onChange={(value) => {
              props.onPasswordChange(value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
          />
          {props.creatingAccount ? (
            <Field
              id="auth-name"
              label="이름 (선택)"
              type="text"
              autoComplete="name"
              value={props.name}
              placeholder="이름을 입력하세요"
              icon={<UserRound size={17} />}
              onChange={props.onNameChange}
            />
          ) : null}

          {!props.creatingAccount ? (
            <div className="flex justify-end">
              <button type="button" onClick={resetPassword} disabled={props.submitting} className="text-xs font-bold text-violet-600 transition hover:text-violet-800 disabled:opacity-50">
                비밀번호 찾기
              </button>
            </div>
          ) : null}

          {props.error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium leading-5 text-red-700">{props.error}</p> : null}
          {props.resetMessage ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-xs font-medium leading-5 text-emerald-700">{props.resetMessage}</p> : null}

          <button type="submit" disabled={props.submitting} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {props.submitting ? <Loader2 className="animate-spin" size={17} /> : null}
            {props.submitting ? "확인 중" : props.creatingAccount ? "계정 만들기" : "로그인"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-bold text-slate-400">또는</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="space-y-3">
          <ProviderButton icon={<Chrome size={18} />} label="Google로 계속하기" disabled={props.submitting} onClick={props.onGoogle} />
          <ProviderButton icon={<Github size={18} />} label="GitHub로 계속하기" disabled={props.submitting || !props.githubEnabled} onClick={props.onGithub} title={props.githubEnabled ? undefined : "GitHub 로그인이 준비되지 않았습니다."} />
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          {props.creatingAccount ? "이미 계정이 있나요?" : "아직 계정이 없나요?"}{" "}
          <button type="button" onClick={switchMode} disabled={props.submitting} className="font-bold text-violet-600 hover:text-violet-800 disabled:opacity-50">
            {props.creatingAccount ? "로그인" : "회원가입"}
          </button>
        </p>
      </section>
    </div>
  );
}

function Field({ id, label, type, autoComplete, value, placeholder, error, icon, inputRef, onChange }: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
  value: string;
  placeholder: string;
  error?: string;
  icon: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-sm font-bold text-slate-700">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>
        <input ref={inputRef} id={id} type={type} autoComplete={autoComplete} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)} className={`h-12 w-full rounded-xl border bg-white pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 ${error ? "border-red-300 focus:ring-4 focus:ring-red-100" : "border-slate-200 focus:border-violet-500 focus:ring-4 focus:ring-violet-100"}`} />
      </span>
      {error ? <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.getAttribute("aria-hidden") !== "true");
}

function ProviderButton({ icon, label, disabled, onClick, title }: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className="inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400">
      {icon}
      {label}
    </button>
  );
}
