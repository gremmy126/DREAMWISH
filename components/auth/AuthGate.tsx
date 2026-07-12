"use client";

import {
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LoginShell } from "@/components/auth/LoginShell";
import {
  AUTH_SESSION_KEY,
  stringifyUnknownError,
  type AccessState
} from "@/src/lib/auth/access-control";
import { getAuthSessionFailureMessage } from "@/src/lib/auth/auth-session-errors";
import {
  changeFirebasePassword,
  createFirebasePasswordAccount,
  firebaseUserHasPasswordProvider,
  getFirebaseClientAuth,
  logoutFirebaseUser,
  sendFirebasePasswordReset,
  signInWithFirebaseGithub,
  signInWithFirebaseGoogle,
  signInWithFirebasePassword,
  waitForFirebaseUser
} from "@/src/lib/firebase/firebase-client";
import { getFirebaseAuthErrorMessage } from "@/src/lib/firebase/firebase-auth-errors";
import { canEnableFirebaseGitHubLogin } from "@/src/lib/firebase/firebase-auth-providers";
import { validatePasswordChange } from "@/src/lib/firebase/firebase-password-policy";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [canChangePassword, setCanChangePassword] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const { t } = useAppLanguage();

  useEffect(() => {
    void restoreSession();
  }, []);

  async function restoreSession() {
    setLoading(true);
    setError(null);
    try {
      const firebaseUser = await waitForFirebaseUser();
      if (!firebaseUser) {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        setAccess(null);
        setEmail("");
        setCanChangePassword(false);
        await logoutServerSession();
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const nextAccess = await fetchAccess(idToken, t("auth.sessionFailed"));
      setAccess(nextAccess);
      setEmail(nextAccess.email);
      setCanChangePassword(firebaseUserHasPasswordProvider());
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: nextAccess.email }));
    } catch (caught) {
      setError(getAuthActionError(caught));
      setAccess(null);
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      const firebaseAuth = getFirebaseClientAuth();
      if (!firebaseAuth) {
        throw new AuthSessionError("Firebase 브라우저 인증 설정을 확인해주세요.");
      }
      if (!password) throw new AuthSessionError("비밀번호를 입력해주세요.");
      const credential = await signInWithFirebasePassword({ email, password });
      const idToken = await credential.user.getIdToken();
      await completeFirebaseLogin(idToken);
    } catch (caught) {
      setError(getAuthActionError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function signup() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      if (password.length < 6) {
        throw new AuthSessionError("비밀번호는 6자 이상이어야 합니다.");
      }
      const credential = await createFirebasePasswordAccount({ email, password, name });
      const idToken = await credential.user.getIdToken();
      await completeFirebaseLogin(idToken);
    } catch (caught) {
      setError(getAuthActionError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function changePassword() {
    const validationError = validatePasswordChange({
      currentPassword,
      newPassword,
      confirmPassword
    });
    if (validationError) {
      setError(validationError);
      setPasswordMessage(null);
      return;
    }
    setSubmitting(true);
    setError(null);
    setPasswordMessage(null);
    try {
      await changeFirebasePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("비밀번호가 안전하게 변경되었습니다.");
    } catch (caught) {
      setError(getFirebaseAuthErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function loginWithGoogle() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      const credential = await signInWithFirebaseGoogle();
      const idToken = await credential.user.getIdToken();
      await completeFirebaseLogin(idToken);
    } catch (caught) {
      setError(getAuthActionError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function loginWithGithub() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      const credential = await signInWithFirebaseGithub();
      const idToken = await credential.user.getIdToken();
      await completeFirebaseLogin(idToken);
    } catch (caught) {
      setError(getAuthActionError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function completeFirebaseLogin(idToken: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const data = (await response.json().catch(() => ({}))) as {
      access?: AccessState;
    };
    if (!response.ok || !data.access) {
      throw new AuthSessionError(getAuthSessionFailureMessage(response.status));
    }
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: data.access.email }));
    setAccess(data.access);
    setEmail(data.access.email);
    setPassword("");
    setCanChangePassword(firebaseUserHasPasswordProvider());
  }

  async function resetPassword() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      if (!email.trim()) {
        setError("비밀번호를 재설정할 이메일을 먼저 입력해주세요.");
        return;
      }
      await sendFirebasePasswordReset(email.trim());
      setResetMessage("비밀번호 재설정 이메일을 보냈습니다. 이메일의 링크를 확인해주세요.");
    } catch (caught) {
      setError(getFirebaseAuthErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function startCheckout() {
    if (!access?.email) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerEmail: access.email,
          customerName: name || access.email,
          externalCustomerId: access.email
        })
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || t("auth.checkoutFailed"));
      }
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(stringifyUnknownError(caught));
      setSubmitting(false);
    }
  }

  async function logout() {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    setAccess(null);
    setEmail("");
    setPassword("");
    setName("");
    setResetMessage(null);
    setCanChangePassword(false);
    closePasswordDialog();
    await Promise.allSettled([logoutFirebaseUser(), logoutServerSession()]);
  }

  function changeAuthMode(nextCreatingAccount: boolean) {
    setCreatingAccount(nextCreatingAccount);
    setPassword("");
    setError(null);
    setResetMessage(null);
  }

  function closePasswordDialog() {
    setShowPasswordChange(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordMessage(null);
    setError(null);
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-app-bg">
        <Loader2 className="animate-spin text-app-primary" size={26} />
      </main>
    );
  }

  if (!access) {
    return (
      <LoginShell
        email={email}
        name={name}
        password={password}
        error={error}
        resetMessage={resetMessage}
        submitting={submitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onNameChange={setName}
        onSubmit={login}
        onSignup={signup}
        creatingAccount={creatingAccount}
        onModeChange={changeAuthMode}
        onResetPassword={resetPassword}
        onGoogle={loginWithGoogle}
        onGithub={canEnableFirebaseGitHubLogin() ? loginWithGithub : undefined}
      />
    );
  }

  if (!access.canUseApp) {
    return (
      <PaymentRequiredShell
        access={access}
        error={error}
        submitting={submitting}
        onCheckout={startCheckout}
        onRefresh={() => void restoreSession()}
        onLogout={logout}
      />
    );
  }

  return (
    <>
      {canChangePassword ? (
        <button
          type="button"
          onClick={() => {
            setError(null);
            setPasswordMessage(null);
            setShowPasswordChange(true);
          }}
          className="fixed bottom-4 right-4 z-50 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted shadow-soft hover:text-app-primary"
        >
          비밀번호 변경
        </button>
      ) : null}
      {showPasswordChange ? (
        <PasswordChangeDialog
          currentPassword={currentPassword}
          newPassword={newPassword}
          confirmPassword={confirmPassword}
          error={error}
          message={passwordMessage}
          submitting={submitting}
          onCurrentPasswordChange={setCurrentPassword}
          onNewPasswordChange={setNewPassword}
          onConfirmPasswordChange={setConfirmPassword}
          onCancel={closePasswordDialog}
          onSubmit={() => void changePassword()}
        />
      ) : null}
      {children}
    </>
  );
}

function PasswordChangeDialog({
  currentPassword,
  newPassword,
  confirmPassword,
  error,
  message,
  submitting,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onCancel,
  onSubmit
}: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  error: string | null;
  message: string | null;
  submitting: boolean;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 px-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="password-change-title"
        className="w-full max-w-md rounded-app border border-app-border bg-white p-6 shadow-soft"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <KeyRound size={18} />
          </div>
          <div>
            <h2 id="password-change-title" className="text-lg font-semibold text-app-text">
              비밀번호 변경
            </h2>
            <p className="mt-1 text-xs text-app-muted">현재 비밀번호로 본인 확인 후 변경합니다.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <PasswordField
            label="현재 비밀번호"
            value={currentPassword}
            autoComplete="current-password"
            onChange={onCurrentPasswordChange}
          />
          <PasswordField
            label="새 비밀번호"
            value={newPassword}
            autoComplete="new-password"
            onChange={onNewPasswordChange}
          />
          <PasswordField
            label="새 비밀번호 확인"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={onConfirmPasswordChange}
          />
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {message}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="h-11 rounded-app border border-app-border bg-white text-sm font-semibold text-app-muted hover:bg-app-hover disabled:bg-slate-100"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
            className="flex h-11 items-center justify-center gap-2 rounded-app bg-app-primary text-sm font-semibold text-white disabled:bg-slate-200"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
            변경하기
          </button>
        </div>
      </section>
    </div>
  );
}

function PasswordField({
  label,
  value,
  autoComplete,
  onChange
}: {
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-app-muted">{label}</span>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
      />
    </label>
  );
}

function PaymentRequiredShell({
  access,
  error,
  submitting,
  onCheckout,
  onRefresh,
  onLogout
}: {
  access: AccessState;
  error: string | null;
  submitting: boolean;
  onCheckout: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const { t } = useAppLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-lg rounded-app border border-app-border bg-white p-7 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-app-hover text-app-primary">
          <CreditCard size={26} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-app-text">{t("auth.paymentTitle")}</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          {t("auth.paymentBody", { email: access.email })}
        </p>

        <div className="mt-5 rounded-app border border-app-border bg-app-bg p-4 text-left text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-app-muted">{t("auth.access")}</span>
            <span className="font-semibold text-app-text">{t("auth.paymentRequired")}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-semibold text-app-muted">{t("auth.adminBypass")}</span>
            <span className="font-semibold text-app-text">{t("auth.off")}</span>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-[1fr_auto] gap-3">
          <button
            type="button"
            onClick={onCheckout}
            disabled={submitting}
            className="flex h-11 items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white disabled:bg-slate-200"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
            {t("auth.pay")}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="h-11 rounded-app border border-app-border bg-white px-4 text-sm font-semibold text-app-muted hover:bg-app-hover"
          >
            {t("common.refresh")}
          </button>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 text-xs font-semibold text-app-muted hover:text-app-primary"
        >
          {t("auth.otherEmail")}
        </button>
      </section>
    </main>
  );
}

export function AccessBadge({ access }: { access: AccessState }) {
  if (!access.canUseApp) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-2xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
      <CheckCircle2 size={12} />
      {access.adminBypass ? "Admin" : "Paid"}
    </span>
  );
}

async function fetchAccess(idToken: string, fallback: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  const data = (await response.json().catch(() => ({}))) as { access?: AccessState };
  if (!response.ok) throw new AuthSessionError(getAuthSessionFailureMessage(response.status));
  if (!data.access) throw new AuthSessionError(fallback);
  return data.access;
}

async function logoutServerSession() {
  await fetch("/api/auth/logout", { method: "POST" });
}

class AuthSessionError extends Error {}

function getAuthActionError(error: unknown) {
  return error instanceof AuthSessionError
    ? error.message
    : getFirebaseAuthErrorMessage(error);
}
