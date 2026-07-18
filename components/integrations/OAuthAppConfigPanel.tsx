"use client";

import {
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  LogIn,
  Save,
  Trash2
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AutomationAppDefinition } from "@/src/lib/automation/app-registry";
import type { PublicOAuthAppConfig } from "@/src/lib/oauth/oauth-app-config.types";

type ConfigResponse = {
  ok?: boolean;
  config?: PublicOAuthAppConfig | null;
  redirectUri?: string;
  officialSetupUrl?: string;
  steps?: string[];
  scopeHelp?: string;
  code?: string;
  error?: string;
};

export function OAuthAppConfigPanel({
  app,
  onChanged
}: {
  app: AutomationAppDefinition;
  onChanged: () => void | Promise<void>;
}) {
  const [config, setConfig] = useState<PublicOAuthAppConfig | null>(null);
  const [redirectUri, setRedirectUri] = useState("");
  const [officialSetupUrl, setOfficialSetupUrl] = useState(app.connectionGuide.officialSetupUrl);
  const [steps, setSteps] = useState(app.connectionGuide.steps);
  const [scopeHelp, setScopeHelp] = useState(app.connectionGuide.scopeHelp);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const revokeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setClientSecret("");
    void fetch(configPath(app.id), { cache: "no-store" })
      .then(readResponse)
      .then((data) => {
        if (!active) return;
        setConfig(data.config || null);
        setClientId(data.config?.clientId || "");
        setRedirectUri(data.redirectUri || "");
        setOfficialSetupUrl(data.officialSetupUrl || app.connectionGuide.officialSetupUrl);
        setSteps(data.steps || app.connectionGuide.steps);
        setScopeHelp(data.scopeHelp || app.connectionGuide.scopeHelp);
      })
      .catch((caught) => {
        if (active) setError(messageOf(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [app]);

  async function saveConfig() {
    if (!clientId.trim() || !clientSecret) return;
    setBusy(true);
    setError(null);
    try {
      const data = await readResponse(await fetch(configPath(app.id), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: clientId.trim(), clientSecret })
      }));
      setConfig(data.config || null);
      setClientId(data.config?.clientId || clientId.trim());
      await onChanged();
    } catch (caught) {
      setError(messageOf(caught));
      queueMicrotask(() => secretRef.current?.focus());
    } finally {
      setClientSecret("");
      setBusy(false);
    }
  }

  async function revokeConfig() {
    if (!window.confirm(`${app.label} OAuth 앱 설정을 폐기하면 기존 연결은 재인증이 필요합니다. 계속할까요?`)) {
      queueMicrotask(() => revokeRef.current?.focus());
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await readResponse(await fetch(configPath(app.id), { method: "DELETE" }));
      setConfig((current) => current ? { ...current, status: "revoked" } : null);
      setClientSecret("");
      await onChanged();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
      queueMicrotask(() => revokeRef.current?.focus());
    }
  }

  async function startOAuth() {
    if (config?.status !== "active") return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/integrations/${encodeURIComponent(app.id)}/oauth/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/?view=integrations" })
      });
      const data = await response.json().catch(() => ({})) as { authorizationUrl?: string; error?: string };
      if (!response.ok || !data.authorizationUrl) throw new Error(data.error || "OAuth 연결을 시작하지 못했습니다.");
      window.location.assign(data.authorizationUrl);
    } catch (caught) {
      setError(messageOf(caught));
      setBusy(false);
    }
  }

  async function copyRedirectUri() {
    try {
      await navigator.clipboard.writeText(redirectUri);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  if (loading) {
    return <div className="flex min-h-24 items-center justify-center text-app-muted"><Loader2 className="animate-spin" size={18} /><span className="ml-2 text-xs">OAuth 설정 확인 중</span></div>;
  }

  const active = config?.status === "active";
  const missing = !clientId.trim() || !clientSecret;

  return (
    <div className="space-y-4 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-app-text">
            {active ? <CheckCircle2 size={17} className="text-emerald-600" /> : null}
            사용자 OAuth 앱 설정
          </div>
          <p className="mt-1 text-[11px] leading-5 text-app-muted">공급자 콘솔에서 직접 만든 앱의 자격증명을 암호화해 저장합니다.</p>
        </div>
        <a href={officialSetupUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white px-3 text-xs font-bold text-blue-700">
          공식 설정 화면 <ExternalLink size={14} />
        </a>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-[11px] leading-5 text-app-muted">
        {steps.map((step) => <li key={step}>{step}</li>)}
      </ol>

      <div className="rounded-xl border border-app-border bg-white p-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-app-text">Redirect URI</span>
          <button type="button" onClick={() => void copyRedirectUri()} disabled={!redirectUri} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-app-border px-3 text-xs font-bold text-app-primary disabled:opacity-40">
            <Clipboard size={14} />{copyState === "copied" ? "복사됨" : "복사"}
          </button>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] leading-5 text-app-muted">{redirectUri}</p>
        <p aria-live="polite" className={`mt-1 text-[10px] ${copyState === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {copyState === "error" ? "복사하지 못했습니다. 직접 선택해 복사해 주세요." : "공급자 콘솔의 Callback URL에 정확히 등록하세요."}
        </p>
      </div>

      <p className="rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-app-muted">{scopeHelp}</p>

      <label className="block">
        <span className="text-xs font-bold text-app-text">Client ID *</span>
        <input type="text" autoComplete="off" value={clientId} onChange={(event) => setClientId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-app-border bg-white px-3 text-sm outline-none focus:border-app-primary" />
      </label>
      <label className="block">
        <span className="text-xs font-bold text-app-text">Client Secret *</span>
        <input ref={secretRef} type="password" autoComplete="new-password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder={active ? "변경할 때만 새 Secret 입력" : "Client Secret 입력"} className="mt-2 h-11 w-full rounded-xl border border-app-border bg-white px-3 text-sm outline-none focus:border-app-primary" />
        <span className="mt-1 block text-[10px] text-app-muted">저장 후 다시 표시되지 않으며 요청이 끝나면 입력창에서 즉시 제거됩니다.</span>
      </label>

      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => void saveConfig()} disabled={busy || missing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{active ? "설정 교체" : "설정 저장"}
        </button>
        <button type="button" onClick={() => void startOAuth()} disabled={busy || !active} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-app-primary px-4 text-sm font-bold text-white disabled:opacity-40">
          <LogIn size={16} />{app.label} 연결
        </button>
      </div>

      {config ? (
        <button ref={revokeRef} type="button" onClick={() => void revokeConfig()} disabled={busy || config.status === "revoked"} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-3 text-xs font-bold text-red-600 disabled:opacity-40">
          <Trash2 size={14} />OAuth 앱 설정 폐기
        </button>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{error}</p> : null}
    </div>
  );
}

function configPath(appId: string) {
  return `/api/integrations/${encodeURIComponent(appId)}/oauth-config`;
}

async function readResponse(response: Response): Promise<ConfigResponse> {
  const data = await response.json().catch(() => ({})) as ConfigResponse;
  if (!response.ok || data.ok === false) throw new Error(data.error || "OAuth 앱 설정을 불러오지 못했습니다.");
  return data;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "OAuth 앱 설정을 처리하지 못했습니다.";
}
