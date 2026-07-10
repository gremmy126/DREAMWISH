"use client";

import {
  CheckCircle2,
  CreditCard,
  Github,
  KeyRound,
  Loader2,
  LogIn,
  ShieldCheck
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  AUTH_SESSION_KEY,
  stringifyUnknownError,
  type AccessState
} from "@/src/lib/auth/access-control";
import {
  getFirebaseClientAuth,
  logoutFirebaseUser,
  sendFirebasePasswordReset,
  signInWithFirebaseGithub,
  signInWithFirebaseGoogle,
  signInWithFirebasePassword,
  waitForFirebaseUser
} from "@/src/lib/firebase/firebase-client";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

type StoredSession = {
  email: string;
};

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
  const { t } = useAppLanguage();

  useEffect(() => {
    void restoreSession();
  }, []);

  async function restoreSession() {
    setLoading(true);
    setError(null);
    try {
      const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
      const session = raw ? (JSON.parse(raw) as StoredSession) : null;
      const firebaseUser = await waitForFirebaseUser();
      if (firebaseUser?.email) {
        const idToken = await firebaseUser.getIdToken();
        const nextAccess = await fetchAccess(firebaseUser.email, t("auth.sessionFailed"), idToken);
        setAccess(nextAccess);
        setEmail(nextAccess.email);
        window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: nextAccess.email }));
        return;
      }
      if (!session?.email) {
        setAccess(null);
        return;
      }
      const nextAccess = await fetchAccess(session.email, t("auth.sessionFailed"));
      setAccess(nextAccess);
      setEmail(nextAccess.email);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
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
      let idToken: string | undefined;
      const firebaseAuth = getFirebaseClientAuth();
      if (firebaseAuth) {
        if (!password) throw new Error("Password is required.");
        const credential = await signInWithFirebasePassword({ email, password });
        idToken = await credential.user.getIdToken();
      }
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, idToken })
      });
      const data = (await response.json()) as {
        access?: AccessState;
        error?: string;
      };
      if (!response.ok || !data.access) {
        throw new Error(data.error || t("auth.failed"));
      }
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: data.access.email }));
      setAccess(data.access);
      setEmail(data.access.email);
      setPassword("");
    } catch (caught) {
      setError(stringifyUnknownError(caught));
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
      await completeFirebaseLogin(idToken, credential.user.email || email, credential.user.displayName || name);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
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
      await completeFirebaseLogin(idToken, credential.user.email || email, credential.user.displayName || name);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setSubmitting(false);
    }
  }

  async function completeFirebaseLogin(idToken: string, fallbackEmail: string, fallbackName: string) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: fallbackEmail, name: fallbackName, idToken })
    });
    const data = (await response.json()) as {
      access?: AccessState;
      error?: string;
    };
    if (!response.ok || !data.access) {
      throw new Error(data.error || t("auth.failed"));
    }
    window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: data.access.email }));
    setAccess(data.access);
    setEmail(data.access.email);
    setPassword("");
  }

  async function resetPassword() {
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      if (!email.trim()) throw new Error("Enter your email first.");
      await sendFirebasePasswordReset(email.trim());
      setResetMessage("Password reset email sent. Open the email to change your password.");
    } catch (caught) {
      setError(stringifyUnknownError(caught));
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

  function logout() {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    void logoutFirebaseUser();
    setAccess(null);
    setEmail("");
    setPassword("");
    setName("");
    setResetMessage(null);
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
        onResetPassword={resetPassword}
        onGoogle={loginWithGoogle}
        onGithub={process.env.NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN === "true" ? loginWithGithub : undefined}
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

  return <>{children}</>;
}

export function LoginShell({
  email,
  name,
  password,
  error,
  resetMessage,
  submitting,
  onEmailChange,
  onPasswordChange,
  onNameChange,
  onSubmit,
  onResetPassword,
  onGoogle,
  onGithub
}: {
  email: string;
  name: string;
  password: string;
  error: string | null;
  resetMessage: string | null;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
  onResetPassword: () => void;
  onGoogle: () => void;
  onGithub?: () => void;
}) {
  const { t } = useAppLanguage();

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-md rounded-app border border-app-border bg-white p-7 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-primary text-white">
            <LogIn size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-app-text">{t("auth.title")}</h1>
            <p className="mt-1 text-sm text-app-muted">{t("auth.subtitle")}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-app-muted">{t("auth.email")}</span>
            <input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              placeholder="you@example.com"
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-app-muted">Password</span>
            <input
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              placeholder="Password"
              type="password"
              autoComplete="current-password"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-app-muted">{t("auth.name")}</span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              placeholder={t("auth.namePlaceholder")}
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        {resetMessage ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {resetMessage}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !email.trim() || !password.trim()}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white disabled:bg-slate-200"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {t("auth.submit")}
        </button>
        <button
          type="button"
          onClick={onResetPassword}
          disabled={submitting || !email.trim()}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-app text-xs font-semibold text-app-muted hover:bg-app-hover hover:text-app-primary disabled:text-slate-300"
        >
          <KeyRound size={14} />
          Forgot password?
        </button>
        <button
          type="button"
          onClick={onGoogle}
          disabled={submitting}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-app border border-app-border bg-white px-4 text-sm font-semibold text-app-text hover:bg-app-hover disabled:bg-slate-100"
        >
          <LogIn size={16} />
          Continue with Google
        </button>
        {onGithub ? (
          <button
            type="button"
            onClick={onGithub}
            disabled={submitting}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-app border border-app-border bg-white px-4 text-sm font-semibold text-app-text hover:bg-app-hover disabled:bg-slate-100"
          >
            <Github size={16} />
            Continue with GitHub
          </button>
        ) : null}
      </section>
    </main>
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

async function fetchAccess(email: string, fallback: string, idToken?: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, idToken })
  });
  const data = (await response.json()) as { access?: AccessState; error?: string };
  if (!response.ok || !data.access) {
    throw new Error(data.error || fallback);
  }
  return data.access;
}
