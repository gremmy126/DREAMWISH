"use client";

import { CheckCircle2, KeyRound, Loader2, LogIn, ShieldAlert, Unplug } from "lucide-react";
import { useEffect, useState } from "react";
import { AppLogo } from "@/components/shared/AppLogo";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import type { VerifiedConnectionState } from "@/src/lib/integrations/verified-connection.service";

export function KeyCredentialPanel({
  appId,
  connection,
  onChanged,
}: {
  appId: string;
  connection?: VerifiedConnectionState;
  onChanged: () => void | Promise<void>;
}) {
  const app = getAutomationApp(appId);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setValues({}); setError(null); }, [appId]);
  if (!app) return <p className="text-sm text-app-muted">지원하지 않는 앱입니다.</p>;

  async function verifyAndSave() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/automation/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId: app!.id, label: `${app!.label} 연결`, values }),
      });
      const data = await response.json().catch(() => ({})) as { credential?: unknown; code?: string; error?: string };
      if (!response.ok || !data.credential) throw new Error(connectionError(data.code, data.error));
      setValues({});
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "연결을 확인하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm(`${app?.label || "이 앱"} 연결을 해제하면 관련 자동화가 대기 상태로 전환될 수 있습니다. 계속할까요?`)) return;
    setBusy(true);
    setError(null);
    try {
      const target = app!.oauthTarget;
      const response = connection?.authMode === "oauth" && target
        ? await fetch(`/api/integrations/${encodeURIComponent(target.provider)}/disconnect?service=${encodeURIComponent(target.service)}`, { method: "POST" })
        : await fetch(`/api/integrations/credentials/${encodeURIComponent(app!.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "연결을 해제하지 못했습니다.");
      }
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "연결을 해제하지 못했습니다.");
    } finally { setBusy(false); }
  }

  function startOAuth() {
    if (!app?.oauthTarget) return;
    const { provider, service } = app.oauthTarget;
    window.location.assign(`/api/integrations/${encodeURIComponent(provider)}/connect?service=${encodeURIComponent(service)}&returnTo=${encodeURIComponent("/?view=integrations")}`);
  }

  const connected = connection?.status === "connected";
  const missing = app.credentialFields.some((field) => field.required && !values[field.id]?.trim());

  return (
    <section className="min-w-0 rounded-[22px] border border-app-border bg-white p-5 shadow-soft">
      <div className="flex items-center gap-3">
        <AppLogo appId={app.id} size={46} color={app.color} />
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-app-text">{app.label} 연결</h2>
          <p className="mt-1 text-xs leading-5 text-app-muted">{app.help}</p>
        </div>
      </div>

      {connected ? (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 size={17} />검증된 계정</div>
          <p className="mt-2 text-xs text-emerald-800">{connection.accountLabel || app.label} · {connection.authMode === "oauth" ? "OAuth" : "API 인증"}</p>
          <button type="button" onClick={() => void disconnect()} disabled={busy} className="mt-4 inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-600 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />}연결 해제
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {connection?.status === "needs_reconnect" ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">기존 정보는 검증되지 않아 연결로 사용하지 않습니다. 다시 인증해 주세요.</p>
          ) : null}

          {app.oauthTarget ? (
            <button type="button" onClick={startOAuth} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-app-primary px-4 text-sm font-bold text-white">
              <LogIn size={16} />{app.label} OAuth로 연결
            </button>
          ) : app.supportedAuthModes.includes("oauth") && app.credentialFields.length === 0 ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800"><ShieldAlert size={18} className="mb-2" />이 앱은 사용자가 Client ID나 Secret을 넣는 방식이 아닙니다. 운영자가 OAuth 앱 설정을 완료해야 연결할 수 있습니다.</div>
          ) : null}

          {app.oauthTarget && app.credentialFields.length ? <div className="flex items-center gap-3 text-[11px] text-app-muted"><span className="h-px flex-1 bg-app-border" />또는 직접 토큰 검증<span className="h-px flex-1 bg-app-border" /></div> : null}

          {app.credentialFields.map((credentialField) => (
            <label key={credentialField.id} className="block">
              <span className="text-xs font-bold text-app-text">{credentialField.label}{credentialField.required ? " *" : ""}</span>
              <input
                type={credentialField.secret ? "password" : "text"}
                autoComplete="off"
                value={values[credentialField.id] || ""}
                onChange={(event) => setValues((current) => ({ ...current, [credentialField.id]: event.target.value }))}
                placeholder={credentialField.placeholder || credentialField.label}
                className="mt-2 h-11 w-full rounded-xl border border-app-border bg-white px-3 text-sm outline-none focus:border-app-primary"
              />
              {credentialField.help ? <span className="mt-1 block text-[11px] text-app-muted">{credentialField.help}</span> : null}
            </label>
          ))}

          {app.credentialFields.length ? (
            <button type="button" onClick={() => void verifyAndSave()} disabled={busy || missing} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}제공자 API 검증 후 연결
            </button>
          ) : null}
        </div>
      )}
      {error ? <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p> : null}
      <p className="mt-4 rounded-xl bg-app-bg p-3 text-[11px] leading-5 text-app-muted">입력값은 제공자 API에서 먼저 검증하며, 성공한 경우에만 서버에서 AES-256-GCM으로 암호화해 저장합니다.</p>
    </section>
  );
}

function connectionError(code?: string, fallback?: string) {
  if (code === "PROVIDER_AUTH_FAILED") return "인증 정보가 올바르지 않거나 필요한 권한이 없습니다.";
  if (code === "PROVIDER_RATE_LIMITED") return "제공자 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.";
  if (code === "PROVIDER_UNAVAILABLE") return "제공자 서버가 일시적으로 응답하지 않습니다.";
  if (code === "UNSAFE_PROVIDER_URL") return "공개 HTTPS 주소만 입력할 수 있습니다.";
  return fallback || "연결 정보를 검증하지 못했습니다.";
}
