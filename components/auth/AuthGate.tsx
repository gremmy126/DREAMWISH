"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { AuthRestoringScreen } from "@/components/auth/AuthRestoringScreen";
import { GuestChatHome } from "@/components/home/GuestChatHome";
import { AUTH_SESSION_KEY, type AccessState } from "@/src/lib/auth/access-control";
import { AUTH_SESSION_CLEARED_EVENT } from "@/src/lib/auth/auth-events";
import { AuthSessionError, readAuthSessionAccess } from "@/src/lib/auth/auth-session-errors";
import {
  getAuthModeResetState,
  normalizeFirebaseAuthEmail
} from "@/src/lib/auth/login-form-validation";
import {
  changeFirebasePassword,
  createFirebasePasswordAccount,
  firebaseUserHasPasswordProvider,
  getFirebaseClientAuth,
  sendFirebasePasswordReset,
  signInWithFirebaseGithub,
  signInWithFirebaseGoogle,
  signInWithFirebasePassword,
  subscribeToFirebaseIdToken,
  waitForFirebaseUser
} from "@/src/lib/firebase/firebase-client";
import {
  getFirebaseAuthErrorMessage,
  type FirebaseAuthMethod
} from "@/src/lib/firebase/firebase-auth-errors";
import { canEnableFirebaseGitHubLogin } from "@/src/lib/firebase/firebase-auth-providers";
import { validatePasswordChange } from "@/src/lib/firebase/firebase-password-policy";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { AccessProvider } from "@/src/lib/auth/access-context";

type AuthGateProps = {
  children: ReactNode;
  hasServerSession: boolean;
};

export function AuthGate({ children, hasServerSession }: AuthGateProps) {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginOpen, setLoginOpen] = useState(false);
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
  const authenticatingRef = useRef(false);
  const lastFirebaseTokenRef = useRef<string | null>(null);
  const { t } = useAppLanguage();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("login") === "1") setLoginOpen(true);
    let active = true;
    let unsubscribeFromTokens: () => void = () => undefined;

    const handleSessionCleared = () => clearAuthenticatedClientState();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" || authenticatingRef.current) return;
      const firebaseUser = getFirebaseClientAuth()?.currentUser;
      if (firebaseUser) void refreshFirebaseSession(firebaseUser, true);
    };

    window.addEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    void (async () => {
      await restoreSession();
      if (!active) return;
      unsubscribeFromTokens = subscribeToFirebaseIdToken((firebaseUser) => {
        if (!active || authenticatingRef.current) return;
        void refreshFirebaseSession(firebaseUser);
      });
    })();

    return () => {
      active = false;
      unsubscribeFromTokens();
      window.removeEventListener(AUTH_SESSION_CLEARED_EVENT, handleSessionCleared);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function clearAuthenticatedClientState() {
    lastFirebaseTokenRef.current = null;
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    setAccess(null);
    setEmail("");
    setCanChangePassword(false);
    setShowPasswordChange(false);
    setLoading(false);
  }

  function applyAuthenticatedAccess(nextAccess: AccessState, idToken: string) {
    lastFirebaseTokenRef.current = idToken;
    setAccess(nextAccess);
    setEmail(nextAccess.email);
    setCanChangePassword(firebaseUserHasPasswordProvider());
    setError(null);
    setLoading(false);
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: nextAccess.email }));
  }

  async function restoreSession() {
    setLoading(true);
    setError(null);
    try {
      const firebaseUser = await waitForFirebaseUser();
      if (!firebaseUser) {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        clearAuthenticatedClientState();
        await logoutServerSession();
        return;
      }

      const idToken = await firebaseUser.getIdToken();
      const nextAccess = await fetchAccess(idToken, t("auth.sessionFailed"));
      applyAuthenticatedAccess(nextAccess, idToken);
    } catch (caught) {
      setError(getAuthActionError(caught));
      clearAuthenticatedClientState();
      setLoginOpen(true);
    } finally {
      setLoading(false);
    }
  }

  async function refreshFirebaseSession(
    firebaseUser: Awaited<ReturnType<typeof waitForFirebaseUser>>,
    forceRefresh = false
  ) {
    if (!firebaseUser) {
      clearAuthenticatedClientState();
      await logoutServerSession();
      return;
    }

    try {
      const idToken = forceRefresh
        ? await firebaseUser.getIdToken(true)
        : await firebaseUser.getIdToken();
      if (!forceRefresh && idToken === lastFirebaseTokenRef.current) return;
      const nextAccess = await fetchAccess(idToken, t("auth.sessionFailed"));
      applyAuthenticatedAccess(nextAccess, idToken);
    } catch (caught) {
      clearAuthenticatedClientState();
      setError(getAuthActionError(caught));
      setLoginOpen(true);
    }
  }

  async function login() {
    setSubmitting(true);
    authenticatingRef.current = true;
    clearMessages();
    try {
      const firebaseAuth = getFirebaseClientAuth();
      if (!firebaseAuth) {
        throw new AuthSessionError("Firebase 브라우저 인증 설정을 확인해주세요.");
      }
      if (!password) throw new AuthSessionError("비밀번호를 입력해주세요.");
      const normalizedEmail = normalizeFirebaseAuthEmail(email);
      const credential = await signInWithFirebasePassword({
        email: normalizedEmail,
        password
      });
      await completeFirebaseLogin(await credential.user.getIdToken());
    } catch (caught) {
      setError(getAuthActionError(caught, "password"));
    } finally {
      authenticatingRef.current = false;
      setSubmitting(false);
    }
  }

  async function signup() {
    setSubmitting(true);
    authenticatingRef.current = true;
    clearMessages();
    try {
      if (password.length < 6) {
        throw new AuthSessionError("비밀번호는 6자 이상이어야 합니다.");
      }
      const normalizedEmail = normalizeFirebaseAuthEmail(email);
      const credential = await createFirebasePasswordAccount({
        email: normalizedEmail,
        password,
        name
      });
      await completeFirebaseLogin(await credential.user.getIdToken());
    } catch (caught) {
      setError(getAuthActionError(caught, "password"));
    } finally {
      authenticatingRef.current = false;
      setSubmitting(false);
    }
  }

  async function loginWithGoogle() {
    setSubmitting(true);
    authenticatingRef.current = true;
    clearMessages();
    try {
      const credential = await signInWithFirebaseGoogle();
      await completeFirebaseLogin(await credential.user.getIdToken());
    } catch (caught) {
      setError(getAuthActionError(caught, "google"));
    } finally {
      authenticatingRef.current = false;
      setSubmitting(false);
    }
  }

  async function loginWithGithub() {
    setSubmitting(true);
    authenticatingRef.current = true;
    clearMessages();
    try {
      const credential = await signInWithFirebaseGithub();
      await completeFirebaseLogin(await credential.user.getIdToken());
    } catch (caught) {
      setError(getAuthActionError(caught, "github"));
    } finally {
      authenticatingRef.current = false;
      setSubmitting(false);
    }
  }

  async function completeFirebaseLogin(idToken: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken })
    });
    const nextAccess = await readAuthSessionAccess(response);
    applyAuthenticatedAccess(nextAccess, idToken);
    setPassword("");
    setLoginOpen(false);
    clearLoginQuery();
  }

  async function resetPassword() {
    setSubmitting(true);
    clearMessages();
    try {
      if (!email.trim()) {
        setError("비밀번호를 재설정할 이메일을 먼저 입력해주세요.");
        return;
      }
      await sendFirebasePasswordReset(email.trim());
      setResetMessage("비밀번호 재설정 이메일을 보냈습니다. 이메일의 링크를 확인해주세요.");
    } catch (caught) {
      setError(getFirebaseAuthErrorMessage(caught, "password"));
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
      setError(getFirebaseAuthErrorMessage(caught, "password"));
    } finally {
      setSubmitting(false);
    }
  }

  function changeAuthMode(nextCreatingAccount: boolean) {
    const resetState = getAuthModeResetState(nextCreatingAccount);
    setCreatingAccount(resetState.creatingAccount);
    setPassword(resetState.password);
    setError(resetState.error);
    setResetMessage(resetState.resetMessage);
  }

  function openLogin() {
    clearMessages();
    setLoginOpen(true);
  }

  function closeLogin() {
    if (submitting) return;
    setLoginOpen(false);
    clearMessages();
    clearLoginQuery();
  }

  function clearMessages() {
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
    return <AuthRestoringScreen />;
  }

  if (!access) {
    return (
      <>
        <GuestChatHome onLoginRequest={openLogin} />
        <LoginDialog
          open={loginOpen}
          email={email}
          name={name}
          password={password}
          error={error}
          resetMessage={resetMessage}
          submitting={submitting}
          creatingAccount={creatingAccount}
          githubEnabled={canEnableFirebaseGitHubLogin()}
          onClose={closeLogin}
          onEmailChange={setEmail}
          onPasswordChange={setPassword}
          onNameChange={setName}
          onSubmit={login}
          onSignup={signup}
          onModeChange={changeAuthMode}
          onResetPassword={resetPassword}
          onGoogle={loginWithGoogle}
          onGithub={loginWithGithub}
        />
      </>
    );
  }

  return (
    <AccessProvider initialAccess={access}>
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
    </AccessProvider>
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

        {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
        {message ? <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{message}</p> : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} disabled={submitting} className="h-11 rounded-app border border-app-border bg-white text-sm font-semibold text-app-muted hover:bg-app-hover disabled:bg-slate-100">
            닫기
          </button>
          <button type="button" onClick={onSubmit} disabled={submitting || !currentPassword || !newPassword || !confirmPassword} className="flex h-11 items-center justify-center gap-2 rounded-app bg-app-primary text-sm font-semibold text-white disabled:bg-slate-200">
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

async function fetchAccess(idToken: string, fallback: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  return readAuthSessionAccess(response, fallback);
}

async function logoutServerSession() {
  await fetch("/api/auth/logout", { method: "POST" });
}

function clearLoginQuery() {
  if (window.location.search) window.history.replaceState(null, "", "/");
}

function getAuthActionError(error: unknown, method: FirebaseAuthMethod = "generic") {
  return error instanceof AuthSessionError
    ? error.message
    : getFirebaseAuthErrorMessage(error, method);
}
