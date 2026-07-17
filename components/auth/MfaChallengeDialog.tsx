"use client";

import { KeyRound, LifeBuoy, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

type MfaMethod = "totp" | "recovery";

type MfaChallengeDialogProps = {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void | Promise<void>;
};

const MFA_ERROR_MESSAGES: Record<string, string> = {
  TOTP_INVALID_CODE: "인증 코드가 올바르지 않습니다. 다시 확인해주세요.",
  TOTP_ENROLLMENT_EXPIRED: "인증기 등록 시간이 만료되었습니다. 다시 등록을 시작해주세요.",
  MFA_CHALLENGE_REQUIRED: "로그인 인증 요청이 없습니다. 다시 로그인해주세요.",
  MFA_CHALLENGE_INVALID: "로그인 인증 요청이 올바르지 않습니다. 다시 로그인해주세요.",
  MFA_CHALLENGE_NOT_FOUND: "로그인 인증 요청을 찾을 수 없습니다. 다시 로그인해주세요.",
  MFA_CHALLENGE_EXPIRED: "로그인 인증 요청이 만료되었습니다. 다시 로그인해주세요.",
  MFA_CHALLENGE_ALREADY_USED: "이미 사용한 로그인 인증 요청입니다. 다시 로그인해주세요.",
  MFA_ACCOUNT_UNAVAILABLE: "이 계정으로는 로그인을 완료할 수 없습니다.",
  TOTP_CODE_REPLAYED: "이미 사용한 인증 코드입니다. 새 코드를 기다렸다가 입력해주세요.",
  TOTP_RATE_LIMITED: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  TOTP_CLOCK_DRIFT: "인증기의 시간이 맞지 않습니다. 기기 시간을 자동으로 동기화한 뒤 다시 시도해주세요.",
  TOTP_NOT_ENABLED: "이 계정에는 활성화된 인증기가 없습니다. 다시 로그인해주세요.",
  RECOVERY_CODE_INVALID: "복구 코드가 올바르지 않거나 이미 사용되었습니다."
};

export function getMfaErrorMessage(code: string, fallback?: string) {
  return (
    MFA_ERROR_MESSAGES[code] ||
    fallback ||
    "추가 인증을 완료하지 못했습니다. 잠시 후 다시 시도해주세요."
  );
}

export function MfaChallengeDialog({ open, onCancel, onSuccess }: MfaChallengeDialogProps) {
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const submittingRef = useRef(false);
  const verificationCompleteRef = useRef(false);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    setMethod("totp");
    setCode("");
    setVerificationComplete(false);
    verificationCompleteRef.current = false;
    submittingRef.current = false;
    setError(null);
    setStatus("인증 앱의 여섯 자리 코드를 입력해주세요.");
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => codeInputRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) {
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusableElements(dialogRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [open]);

  if (!open) return null;

  function changeMethod(nextMethod: MfaMethod) {
    if (verificationCompleteRef.current) return;
    setMethod(nextMethod);
    setCode("");
    setError(null);
    setStatus(
      nextMethod === "totp"
        ? "인증 앱의 여섯 자리 코드를 입력해주세요."
        : "안전하게 보관한 일회용 복구 코드를 입력해주세요."
    );
    window.requestAnimationFrame(() => codeInputRef.current?.focus());
  }

  function changeCode(value: string) {
    setCode(
      method === "totp"
        ? value.replace(/\D/gu, "").slice(0, 6)
        : value.toUpperCase().slice(0, 64)
    );
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!verificationCompleteRef.current && method === "totp" && !/^[0-9]{6}$/u.test(code)) {
      setError("여섯 자리 인증 코드를 입력해주세요.");
      codeInputRef.current?.focus();
      return;
    }
    if (!verificationCompleteRef.current && method === "recovery" && !code.trim()) {
      setError("복구 코드를 입력해주세요.");
      codeInputRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setStatus(
      verificationCompleteRef.current
        ? "로그인 상태를 다시 불러오고 있습니다."
        : "추가 인증을 확인하고 있습니다."
    );
    try {
      if (!verificationCompleteRef.current) {
        const response = await fetch("/api/auth/mfa/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method, code: code.trim() })
        });
        const data = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          code?: string;
          error?: string;
        };
        if (!response.ok || data.ok !== true) {
          setStatus(null);
          setError(getMfaErrorMessage(data.code || "", data.error));
          codeInputRef.current?.focus();
          return;
        }
        verificationCompleteRef.current = true;
        setVerificationComplete(true);
        setStatus("추가 인증은 완료되었습니다. 로그인 상태를 불러오고 있습니다.");
        setCode("");
      }
      await onSuccess();
    } catch {
      setStatus(null);
      if (verificationCompleteRef.current) {
        setError("추가 인증은 완료되었습니다. 로그인 상태를 불러오지 못했습니다. 다시 시도해주세요.");
        window.requestAnimationFrame(() => submitButtonRef.current?.focus());
      } else {
        setError("추가 인증을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
        codeInputRef.current?.focus();
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/50 px-4 py-8 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-challenge-title"
        aria-describedby="mfa-challenge-description"
        className="max-h-full w-full max-w-[440px] overflow-y-auto rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_28px_90px_rgba(15,23,42,0.25)] sm:p-8"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200">
              <ShieldCheck size={22} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">DREAMWISH</p>
              <h2 id="mfa-challenge-title" className="mt-1 text-xl font-bold tracking-tight text-slate-950">
                추가 인증
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            aria-label="추가 인증 창 닫기"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:opacity-40"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <p id="mfa-challenge-description" className="mt-4 text-sm leading-6 text-slate-500">
          계정을 보호하기 위해 인증 앱 또는 복구 코드로 로그인을 마무리해주세요.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2" role="group" aria-label="추가 인증 방식">
          <button
            type="button"
            onClick={() => changeMethod("totp")}
            aria-pressed={method === "totp"}
            disabled={submitting || verificationComplete}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-4 focus:ring-violet-100 ${
              method === "totp"
                ? "border-violet-600 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <KeyRound size={16} aria-hidden="true" />
            인증 코드
          </button>
          <button
            type="button"
            onClick={() => changeMethod("recovery")}
            aria-pressed={method === "recovery"}
            disabled={submitting || verificationComplete}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold focus:outline-none focus:ring-4 focus:ring-violet-100 ${
              method === "recovery"
                ? "border-violet-600 bg-violet-50 text-violet-700"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            <LifeBuoy size={16} aria-hidden="true" />
            복구 코드
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          {!verificationComplete ? <label htmlFor="mfa-challenge-code" className="block">
            <span className="mb-2 block text-sm font-bold text-slate-700">
              {method === "totp" ? "여섯 자리 인증 코드" : "일회용 복구 코드"}
            </span>
            <input
              ref={codeInputRef}
              id="mfa-challenge-code"
              value={code}
              type="text"
              inputMode={method === "totp" ? "numeric" : "text"}
              pattern={method === "totp" ? "[0-9]{6}" : undefined}
              autoComplete={method === "totp" ? "one-time-code" : "off"}
              maxLength={method === "totp" ? 6 : 64}
              aria-invalid={Boolean(error)}
              onChange={(event) => changeCode(event.target.value)}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-base font-bold tracking-[0.18em] text-slate-950 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-100"
            />
          </label> : null}

          {status ? (
            <p role="status" aria-live="polite" className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs font-medium leading-5 text-blue-700">
              {status}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs font-medium leading-5 text-red-700">
              {error}
            </p>
          ) : null}

          <button
            ref={submitButtonRef}
            type="submit"
            disabled={submitting}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:bg-violet-700 focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {submitting ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
            {submitting
              ? "확인 중"
              : verificationComplete
                ? "로그인 상태 다시 불러오기"
                : "로그인 완료"}
          </button>
        </form>
      </section>
    </div>
  );
}

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    )
  );
}
