"use client";

import { Check, Copy, KeyRound, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

type FactorState = "disabled" | "pending" | "active";

type EnrollmentState = {
  enrollmentId: string;
  otpauthUri: string;
  manualKey: string;
  expiresAt: string;
};

type ApiError = {
  code?: string;
  error?: string;
};

export function AuthenticatorSettingsCard() {
  const [factorState, setFactorState] = useState<FactorState | "loading">("loading");
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [currentTotpCode, setCurrentTotpCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verificationInputRef = useRef<HTMLInputElement>(null);
  const recoveryAcknowledgeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/auth/totp/status", {
          cache: "no-store",
          signal: controller.signal
        });
        const data = (await response.json().catch(() => ({}))) as {
          factor?: { status?: unknown };
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "인증기 상태를 불러오지 못했습니다.");
        setFactorState(asFactorState(data.factor?.status));
      } catch (caught) {
        if (controller.signal.aborted) return;
        setFactorState("disabled");
        setError(errorMessage(caught, "인증기 상태를 불러오지 못했습니다."));
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!enrollment) return;
    verificationInputRef.current?.focus();
  }, [enrollment]);

  useEffect(() => {
    if (!recoveryCodes) return;
    recoveryAcknowledgeRef.current?.focus();
  }, [recoveryCodes]);

  async function beginEnrollment() {
    setBusy("enroll");
    clearNotice();
    try {
      const response = await fetch("/api/auth/totp/enroll", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as ApiError & {
        enrollment?: EnrollmentState;
      };
      if (!response.ok || !data.enrollment) throw apiError(data, "인증기 등록을 시작하지 못했습니다.");
      setEnrollment(data.enrollment);
      setFactorState("pending");
      setVerificationCode("");
      setMessage("인증 앱으로 QR 코드를 스캔한 뒤 여섯 자리 코드를 입력해주세요.");
    } catch (caught) {
      setError(errorMessage(caught, "인증기 등록을 시작하지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  async function verifyEnrollment() {
    if (!enrollment || !/^[0-9]{6}$/u.test(verificationCode)) {
      setError("여섯 자리 인증 코드를 입력해주세요.");
      verificationInputRef.current?.focus();
      return;
    }
    setBusy("verify");
    clearNotice();
    try {
      const response = await fetch("/api/auth/totp/verify-enrollment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enrollmentId: enrollment.enrollmentId, code: verificationCode })
      });
      const data = (await response.json().catch(() => ({}))) as ApiError & {
        status?: FactorState;
        recoveryCodes?: string[];
      };
      if (!response.ok || !Array.isArray(data.recoveryCodes)) {
        throw apiError(data, "인증 코드를 확인하지 못했습니다.");
      }
      setFactorState("active");
      setEnrollment(null);
      setVerificationCode("");
      setRecoveryCodes(data.recoveryCodes);
      setMessage("인증기가 활성화되었습니다. 복구 코드는 지금 한 번만 표시됩니다.");
    } catch (caught) {
      setError(errorMessage(caught, "인증 코드를 확인하지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  async function copyManualKey() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.manualKey);
      setMessage("수동 입력 키를 복사했습니다.");
      setError(null);
    } catch {
      setError("수동 입력 키를 복사하지 못했습니다. 직접 선택해 복사해주세요.");
    }
  }

  async function regenerateCodes() {
    if (!validateCurrentCode()) return;
    setBusy("regenerate");
    clearNotice();
    try {
      const response = await fetch("/api/auth/totp/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTotpCode })
      });
      const data = (await response.json().catch(() => ({}))) as ApiError & {
        recoveryCodes?: string[];
      };
      if (!response.ok || !Array.isArray(data.recoveryCodes)) {
        throw apiError(data, "복구 코드를 다시 만들지 못했습니다.");
      }
      setCurrentTotpCode("");
      setRecoveryCodes(data.recoveryCodes);
      setMessage("기존 복구 코드는 폐기되었습니다. 새 코드는 지금 한 번만 표시됩니다.");
    } catch (caught) {
      setError(errorMessage(caught, "복구 코드를 다시 만들지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  async function disableAuthenticator() {
    if (!validateCurrentCode()) return;
    setBusy("disable");
    clearNotice();
    try {
      const response = await fetch("/api/auth/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentTotpCode })
      });
      const data = (await response.json().catch(() => ({}))) as ApiError & {
        status?: FactorState;
      };
      if (!response.ok || data.status !== "disabled") {
        throw apiError(data, "인증기 사용을 중지하지 못했습니다.");
      }
      setFactorState("disabled");
      setCurrentTotpCode("");
      setEnrollment(null);
      setRecoveryCodes(null);
      setMessage("인증기 사용을 중지했습니다.");
    } catch (caught) {
      setError(errorMessage(caught, "인증기 사용을 중지하지 못했습니다."));
    } finally {
      setBusy(null);
    }
  }

  function validateCurrentCode() {
    if (/^[0-9]{6}$/u.test(currentTotpCode)) return true;
    setError("현재 여섯 자리 인증 코드를 입력해주세요.");
    return false;
  }

  function acknowledgeRecoveryCodes() {
    setRecoveryCodes(null);
    setMessage("복구 코드를 안전하게 보관했습니다.");
    setError(null);
  }

  function clearNotice() {
    setMessage(null);
    setError(null);
  }

  return (
    <section aria-labelledby="authenticator-settings-title" className="mt-5 border-t border-app-border pt-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
          <KeyRound size={18} aria-hidden="true" />
        </span>
        <div>
          <h3 id="authenticator-settings-title" className="text-sm font-semibold text-app-text">
            인증기
          </h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            로그인할 때 인증 앱의 일회용 코드를 한 번 더 확인합니다.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-app border border-app-border bg-app-bg p-4">
        <p className="text-xs font-semibold text-app-muted">
          상태: {stateLabel(factorState)}
        </p>

        {factorState === "loading" ? (
          <div className="mt-3 flex min-h-11 items-center gap-2 text-xs text-app-muted">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            인증기 상태 확인 중
          </div>
        ) : null}

        {factorState === "disabled" && !recoveryCodes ? (
          <button
            type="button"
            onClick={() => void beginEnrollment()}
            disabled={busy !== null}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:bg-slate-300"
          >
            {busy === "enroll" ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            인증기 등록
          </button>
        ) : null}

        {factorState === "pending" && !enrollment && !recoveryCodes ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-app-muted">
              이전 등록의 비밀 키는 다시 표시하지 않습니다. 새 등록을 시작해주세요.
            </p>
            <button
              type="button"
              onClick={() => void beginEnrollment()}
              disabled={busy !== null}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-app border border-app-border bg-app-card px-4 text-sm font-semibold text-app-text focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100"
            >
              <RefreshCw size={16} aria-hidden="true" />
              등록 다시 시작
            </button>
          </div>
        ) : null}

        {enrollment ? (
          <div className="mt-4 space-y-4">
            <div className="flex justify-center rounded-2xl bg-app-card p-4">
              <QRCodeSVG
                value={enrollment.otpauthUri}
                size={200}
                level="M"
                marginSize={2}
                title="DREAMWISH 인증기 등록 QR 코드"
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-app-muted">수동 입력 키</p>
              <code className="mt-2 block break-all rounded-xl bg-app-card px-3 py-2 text-xs font-semibold text-app-text">
                {enrollment.manualKey}
              </code>
              <button
                type="button"
                onClick={() => void copyManualKey()}
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app border border-app-border bg-app-card px-4 text-sm font-semibold text-app-text focus:outline-none focus:ring-4 focus:ring-violet-100"
              >
                <Copy size={16} aria-hidden="true" />
                수동 입력 키 복사
              </button>
            </div>
            <label htmlFor="totp-enrollment-code" className="block">
              <span className="text-xs font-semibold text-app-muted">여섯 자리 인증 코드</span>
              <input
                ref={verificationInputRef}
                id="totp-enrollment-code"
                value={verificationCode}
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-card px-4 text-center text-lg font-semibold tracking-[0.3em] text-app-text outline-none focus:border-app-primary focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void verifyEnrollment()}
              disabled={busy !== null || verificationCode.length !== 6}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:bg-slate-300"
            >
              {busy === "verify" ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              등록 확인
            </button>
          </div>
        ) : null}

        {recoveryCodes ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <h4 className="text-sm font-semibold text-amber-950">복구 코드를 지금 저장하세요</h4>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              이 코드는 다시 표시되지 않습니다. 각 코드는 한 번만 사용할 수 있습니다.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="일회용 복구 코드">
              {recoveryCodes.map((recoveryCode) => (
                <li key={recoveryCode}>
                  <code className="block rounded-lg bg-app-card px-2 py-2 text-center text-xs font-semibold text-slate-900">
                    {recoveryCode}
                  </code>
                </li>
              ))}
            </ul>
            <button
              ref={recoveryAcknowledgeRef}
              type="button"
              onClick={acknowledgeRecoveryCodes}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-amber-700 px-4 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-amber-200"
            >
              <Check size={16} aria-hidden="true" />
              복구 코드를 안전하게 보관했습니다
            </button>
          </div>
        ) : null}

        {factorState === "active" && !recoveryCodes ? (
          <div className="mt-4 space-y-3">
            <label htmlFor="totp-current-code" className="block">
              <span className="text-xs font-semibold text-app-muted">현재 인증 코드</span>
              <input
                id="totp-current-code"
                value={currentTotpCode}
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                maxLength={6}
                onChange={(event) => setCurrentTotpCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-card px-4 text-center text-lg font-semibold tracking-[0.3em] text-app-text outline-none focus:border-app-primary focus:ring-4 focus:ring-violet-100"
              />
            </label>
            <button
              type="button"
              onClick={() => void regenerateCodes()}
              disabled={busy !== null || currentTotpCode.length !== 6}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-app border border-app-border bg-app-card px-3 text-xs font-semibold text-app-text focus:outline-none focus:ring-4 focus:ring-violet-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {busy === "regenerate" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              복구 코드 다시 만들기
            </button>
            <button
              type="button"
              onClick={() => void disableAuthenticator()}
              disabled={busy !== null || currentTotpCode.length !== 6}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-app border border-red-200 bg-app-card px-3 text-xs font-semibold text-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {busy === "disable" ? <Loader2 size={15} className="animate-spin" /> : <ShieldOff size={15} />}
              인증기 사용 중지
            </button>
            <p className="text-[11px] leading-5 text-app-muted">
              복구 코드 재발급과 사용 중지는 최근 5분 안에 로그인한 세션에서만 가능합니다.
            </p>
          </div>
        ) : null}
      </div>

      {message ? (
        <p role="status" aria-live="polite" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function asFactorState(value: unknown): FactorState {
  return value === "pending" || value === "active" ? value : "disabled";
}

function stateLabel(state: FactorState | "loading") {
  if (state === "active") return "사용 중";
  if (state === "pending") return "등록 진행 중";
  if (state === "disabled") return "사용 안 함";
  return "확인 중";
}

function apiError(data: ApiError, fallback: string) {
  return new Error(data.error || fallback);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
