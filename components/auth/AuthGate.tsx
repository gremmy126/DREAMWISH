"use client";

import { CheckCircle2, CreditCard, Loader2, LogIn, ShieldCheck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  AUTH_SESSION_KEY,
  stringifyUnknownError,
  type AccessState
} from "@/src/lib/auth/access-control";

type StoredSession = {
  email: string;
};

type AuthGateProps = {
  children: ReactNode;
};

export function AuthGate({ children }: AuthGateProps) {
  const [access, setAccess] = useState<AccessState | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void restoreSession();
  }, []);

  async function restoreSession() {
    setLoading(true);
    setError(null);
    try {
      const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
      const session = raw ? (JSON.parse(raw) as StoredSession) : null;
      if (!session?.email) {
        setAccess(null);
        return;
      }
      const nextAccess = await fetchAccess(session.email);
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
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name })
      });
      const data = (await response.json()) as {
        access?: AccessState;
        error?: string;
      };
      if (!response.ok || !data.access) {
        throw new Error(data.error || "로그인하지 못했습니다.");
      }
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ email: data.access.email }));
      setAccess(data.access);
      setEmail(data.access.email);
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
        throw new Error(data.error || "결제를 시작하지 못했습니다.");
      }
      window.location.href = data.checkoutUrl;
    } catch (caught) {
      setError(stringifyUnknownError(caught));
      setSubmitting(false);
    }
  }

  function logout() {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    setAccess(null);
    setEmail("");
    setName("");
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
        error={error}
        submitting={submitting}
        onEmailChange={setEmail}
        onNameChange={setName}
        onSubmit={login}
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
  error,
  submitting,
  onEmailChange,
  onNameChange,
  onSubmit
}: {
  email: string;
  name: string;
  error: string | null;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-md rounded-app border border-app-border bg-white p-7 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-primary text-white">
            <LogIn size={20} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-app-text">DREAMWISH 로그인</h1>
            <p className="mt-1 text-sm text-app-muted">이메일로 앱 접근 권한을 확인합니다.</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-xs font-semibold text-app-muted">Email</span>
            <input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              placeholder="you@example.com"
              type="email"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-app-muted">Name</span>
            <input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              className="mt-2 h-11 w-full rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              placeholder="선택 사항"
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || !email.trim()}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white disabled:bg-slate-200"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          로그인
        </button>
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
  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-lg rounded-app border border-app-border bg-white p-7 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-app-hover text-app-primary">
          <CreditCard size={26} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-app-text">결제가 필요합니다</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          {access.email} 계정은 DREAMWISH Pro 결제 후 사용할 수 있습니다. 관리자 계정만
          결제 없이 전체 기능을 사용할 수 있습니다.
        </p>

        <div className="mt-5 rounded-app border border-app-border bg-app-bg p-4 text-left text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-app-muted">Access</span>
            <span className="font-semibold text-app-text">payment required</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-semibold text-app-muted">Admin bypass</span>
            <span className="font-semibold text-app-text">off</span>
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
            결제하기
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="h-11 rounded-app border border-app-border bg-white px-4 text-sm font-semibold text-app-muted hover:bg-app-hover"
          >
            새로고침
          </button>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="mt-4 text-xs font-semibold text-app-muted hover:text-app-primary"
        >
          다른 이메일로 로그인
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

async function fetchAccess(email: string) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  const data = (await response.json()) as { access?: AccessState; error?: string };
  if (!response.ok || !data.access) {
    throw new Error(data.error || "세션을 확인하지 못했습니다.");
  }
  return data.access;
}
