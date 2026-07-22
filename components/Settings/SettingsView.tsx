"use client";

import {
  Bot,
  CheckCircle2,
  Database,
  HardDrive,
  KeyRound,
  Languages,
  Loader2,
  LockKeyhole,
  Moon,
  Palette,
  RotateCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TimerReset,
  UserRound,
  Workflow
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StorageStatus } from "@/components/Common/StorageStatus";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { AiCreditStore } from "@/components/billing/AiCreditStore";
import { SubscriptionSettingsCard } from "@/components/billing/SubscriptionSettingsCard";
import { AuthenticatorSettingsCard } from "@/components/Settings/AuthenticatorSettingsCard";
import { DesignSystemCard } from "@/components/Settings/DesignSystemCard";
import { McpServersCard } from "@/components/Settings/McpServersCard";
import { OrganizationSettingsCard } from "@/components/Settings/OrganizationSettingsCard";
import { openCookieSettings } from "@/components/consent/consent";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { t as translate } from "@/src/lib/i18n/translations";
import { defaultPermissionPolicy } from "@/src/lib/security/permission-policy";
import {
  APP_SETTINGS_STORAGE_KEY,
  LANGUAGE_OPTIONS,
  applyDocumentLanguage,
  emitLanguagePreferenceChange,
  resolveThemePreference
} from "@/src/lib/settings/app-preferences";

type ThemeMode = "system" | "light" | "dark";
type ProviderMode =
  | "claude"
  | "groq"
  | "gemini"
  | "openrouter";
type LanguageMode = "ko" | "en" | "ja";
type BackupInterval = "manual" | "hourly" | "daily" | "weekly";

type AccountProfile = {
  email: string;
  name: string | null;
  role: string;
  accountStatus: string;
};
type AccountState =
  | { status: "loading" }
  | { status: "loaded"; account: AccountProfile }
  | { status: "error"; message: string };

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  active: "정상",
  suspended: "정지됨",
  pending: "대기 중",
  disabled: "비활성화"
};

const SETTINGS_KEY = APP_SETTINGS_STORAGE_KEY;

type LocalSettings = {
  theme: ThemeMode;
  provider: ProviderMode;
  language: LanguageMode;
  timezone: string;
  storagePath: string;
  localOnly: boolean;
  allowExternalAI: boolean;
  integrations: {
    mockMode: boolean;
    autoSync: boolean;
    approvalRequiredFrom: "high" | "critical";
    retentionDays: number;
  };
  backup: {
    path: string;
    autoBackup: boolean;
    interval: BackupInterval;
    lastBackupAt: string | null;
    lastBackupPath: string | null;
  };
};

const defaultSettings: LocalSettings = {
  theme: "system",
  provider: "groq",
  language: "ko",
  timezone: "",
  storagePath: "SecondBrain",
  localOnly: false,
  allowExternalAI: true,
  integrations: {
    mockMode: defaultPermissionPolicy.mockMode,
    autoSync: defaultPermissionPolicy.autoSync,
    approvalRequiredFrom: "high",
    retentionDays: 90
  },
  backup: {
    path: "Backups",
    autoBackup: false,
    interval: "manual",
    lastBackupAt: null,
    lastBackupPath: null
  }
};

const providerOptions: ProviderMode[] = [
  "claude",
  "groq",
  "gemini",
  "openrouter"
];

const providerDisplayNames: Record<ProviderMode, string> = {
  claude: "Claude",
  groq: "Groq",
  gemini: "Gemini",
  openrouter: "OpenRouter"
};

// 과거 설정에 저장된 지원 종료 공급자(Hugging Face 등)는 기본 공급자로
// 안전하게 대체해 설정 화면이 빈 선택으로 깨지지 않게 한다.
function normalizeProviderMode(value: unknown): ProviderMode {
  return providerOptions.includes(value as ProviderMode)
    ? (value as ProviderMode)
    : defaultSettings.provider;
}

const sections = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "models", label: "AI Models", icon: Bot },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "integrations", label: "Integrations", icon: Workflow },
  { id: "security", label: "Security", icon: ShieldCheck }
] as const;

export function SettingsView() {
  const [settings, setSettings] = useState<LocalSettings>(defaultSettings);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState<(typeof sections)[number]["id"]>(
    "models"
  );
  const [backupState, setBackupState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
  }>({ loading: false, message: null, error: null });
  const [languageNotice, setLanguageNotice] = useState<string | null>(null);
  const [accountState, setAccountState] = useState<AccountState>({ status: "loading" });
  // Monotonic token so a slow/duplicate request or a request that resolves
  // after the component unmounts can never overwrite a newer result.
  const accountRequestRef = useRef(0);
  const { t } = useAppLanguage();

  const loadAccount = useCallback(async () => {
    const token = ++accountRequestRef.current;
    setAccountState({ status: "loading" });
    try {
      // The account card only reads the signed-in profile, so it must call the
      // GET-only /api/auth/me endpoint. Calling /api/auth/session (POST-only)
      // with GET returned 405 and left the card stuck on "불러오는 중".
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "로그인이 필요합니다. 다시 로그인해 주세요."
            : `계정 정보를 불러오지 못했습니다. (HTTP ${response.status})`
        );
      }
      const data = (await response.json()) as {
        account?: { email?: string; name?: string | null; role?: string; status?: string };
      };
      if (!data.account?.email) {
        throw new Error("계정 정보를 불러오지 못했습니다.");
      }
      if (token !== accountRequestRef.current) return;
      setAccountState({
        status: "loaded",
        account: {
          email: data.account.email,
          name: data.account.name || null,
          role: data.account.role || "user",
          accountStatus: data.account.status || "active"
        }
      });
    } catch (error) {
      if (token !== accountRequestRef.current) return;
      setAccountState({
        status: "error",
        message: error instanceof Error ? error.message : "계정 정보를 불러오지 못했습니다."
      });
    }
  }, []);

  useEffect(() => {
    void loadAccount();
    // Invalidate any in-flight request when the view unmounts.
    return () => {
      accountRequestRef.current += 1;
    };
  }, [loadAccount]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings(mergeSettings(JSON.parse(raw) as Partial<LocalSettings>));
    } catch {
      setSettings(defaultSettings);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    emitLanguagePreferenceChange(settings.language);
  }, [settings, settingsLoaded]);

  useEffect(() => {
    const systemPrefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
    const theme = resolveThemePreference(settings.theme, systemPrefersDark);
    document.documentElement.dataset.theme = theme.dataTheme;
    applyDocumentLanguage(settings.language, document);
  }, [settings.theme, settings.language]);

  useEffect(() => {
    if (!languageNotice) return;
    const timeout = window.setTimeout(() => setLanguageNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [languageNotice]);

  function changeLanguage(value: string) {
    const language = value as LanguageMode;
    setSettings((prev) => ({ ...prev, language }));
    setLanguageNotice(translate(language, "settings.languageChanged"));
  }

  async function runLocalBackup() {
    setBackupState({ loading: true, message: null, error: null });
    try {
      const response = await fetch("/api/local/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourcePath: settings.storagePath,
          targetRoot: settings.backup.path
        })
      });
      const data = (await response.json()) as {
        backupPath?: string;
        createdAt?: string;
        error?: string;
      };

      if (!response.ok) throw new Error(data.error || t("settings.backupFailed"));
      setSettings((prev) => ({
        ...prev,
        backup: {
          ...prev.backup,
          lastBackupAt: data.createdAt || new Date().toISOString(),
          lastBackupPath: data.backupPath || null
        }
      }));
      setBackupState({ loading: false, message: t("settings.backupSuccess"), error: null });
    } catch (error) {
      setBackupState({
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : t("settings.backupFailed")
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">{t("settings.pageTitle")}</h1>
          <p className="mt-2 text-sm text-app-muted">
            {t("settings.description")}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
        >
          <Save size={16} />
          {t("settings.saved")}
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-5">
        <div className="space-y-5">
          <SurfaceCard className="p-6">
            <PanelTitle
              icon={UserRound}
              title="계정 · 프로필"
              description="로그인된 계정과 기본 시간대를 관리합니다. 시간대는 자동화 예약 실행에 사용됩니다."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-app-border bg-app-bg p-4">
                <p className="text-[11px] font-semibold text-app-muted">로그인 계정</p>
                {accountState.status === "loading" ? (
                  <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-app-muted">
                    <Loader2 size={13} className="animate-spin" />
                    계정 정보를 불러오는 중…
                  </p>
                ) : accountState.status === "error" ? (
                  <div className="mt-1.5">
                    <p className="text-xs font-semibold text-red-600">{accountState.message}</p>
                    <button
                      type="button"
                      onClick={() => void loadAccount()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-app-card px-2.5 py-1.5 text-[11px] font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
                    >
                      <RotateCw size={12} />
                      다시 시도
                    </button>
                  </div>
                ) : (
                  <>
                    {accountState.account.name ? (
                      <p className="mt-1 truncate text-sm font-semibold text-app-text">
                        {accountState.account.name}
                      </p>
                    ) : null}
                    <p
                      className={`truncate text-app-text ${
                        accountState.account.name ? "mt-0.5 text-[11px] text-app-muted" : "mt-1 text-sm font-semibold"
                      }`}
                    >
                      {accountState.account.email}
                    </p>
                    <p className="mt-1 text-[11px] text-app-muted">
                      권한: {accountState.account.role === "admin" ? "관리자" : "일반 사용자"}
                      {" · "}
                      상태: {ACCOUNT_STATUS_LABELS[accountState.account.accountStatus] || accountState.account.accountStatus}
                    </p>
                  </>
                )}
              </div>
              <label className="rounded-2xl border border-app-border bg-app-bg p-4">
                <span className="text-[11px] font-semibold text-app-muted">기본 시간대</span>
                <select
                  value={settings.timezone}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, timezone: event.target.value }))
                  }
                  className="mt-1.5 h-10 w-full rounded-xl border border-app-border bg-app-card px-3 text-xs font-semibold text-app-text outline-none"
                >
                  <option value="">시스템 시간대 사용 ({systemTimezone()})</option>
                  {COMMON_TIMEZONES.map((zone) => (
                    <option key={zone} value={zone}>{zone}</option>
                  ))}
                </select>
                <span className="mt-1.5 block text-[11px] leading-4 text-app-muted">
                  자동화 예약, 리포트 기간 계산의 기준 시간대입니다.
                </span>
              </label>
            </div>
          </SurfaceCard>

          <OrganizationSettingsCard />

          <SubscriptionSettingsCard />

          <SurfaceCard className="p-6">
            <AiCreditStore />
          </SurfaceCard>

          <McpServersCard />

          <DesignSystemCard />

          <SurfaceCard className="p-6">
            <PanelTitle
              icon={Bot}
              title={t("settings.models")}
              description={t("settings.modelsDescription")}
            />
            <div className="grid grid-cols-3 gap-3">
              {providerOptions.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, provider }))}
                  className={`rounded-app border p-4 text-left transition ${
                    settings.provider === provider
                      ? "border-app-primary bg-app-hover"
                      : "border-app-border bg-app-card hover:bg-app-hover"
                  }`}
                >
                  <p className="text-sm font-semibold text-app-text">{providerDisplayNames[provider]}</p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">
                    {t("settings.providerDescription")}
                  </p>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <PanelTitle
              icon={Workflow}
              title={t("settings.integrations")}
              description={t("settings.integrationsDescription")}
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleTile
                title={t("settings.mockMode")}
                description={t("settings.mockModeDescription")}
                checked={settings.integrations.mockMode}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, mockMode: checked }
                  }))
                }
              />
              <ToggleTile
                title={t("settings.autoSync")}
                description={t("settings.autoSyncDescription")}
                checked={settings.integrations.autoSync}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, autoSync: checked }
                  }))
                }
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SelectField
                label={t("settings.approvalRisk")}
                value={settings.integrations.approvalRequiredFrom}
                options={["high", "critical"]}
                onChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: {
                      ...prev.integrations,
                      approvalRequiredFrom: value as "high" | "critical"
                    }
                  }))
                }
              />
              <NumberField
                label={t("settings.retentionDays")}
                value={settings.integrations.retentionDays}
                onChange={(value) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, retentionDays: value }
                  }))
                }
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <PanelTitle
              icon={HardDrive}
              title={t("settings.storageBackup")}
              description={t("settings.storageBackupDescription")}
            />
            <div className="grid grid-cols-[minmax(0,1fr)_220px] gap-3">
              <input
                value={settings.storagePath}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, storagePath: event.target.value }))
                }
                className="rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
              />
              <button
                type="button"
                onClick={() => void runLocalBackup()}
                disabled={backupState.loading}
                className="inline-flex items-center justify-center gap-2 rounded-app bg-app-primary px-4 text-sm font-semibold text-white disabled:bg-slate-200"
              >
                <TimerReset size={16} />
                {t("settings.backupNow")}
              </button>
            </div>
            {backupState.message ? (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                {backupState.message}
              </p>
            ) : null}
            {backupState.error ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {backupState.error}
              </p>
            ) : null}
          </SurfaceCard>
        </div>

        <div className="space-y-5">
          <SurfaceCard className="p-5">
            <PanelTitle icon={Palette} title={t("settings.appearance")} description={t("settings.appearanceDescription")} />
            <div className="grid grid-cols-3 gap-2">
              <IconChoice
                icon={Palette}
                label={t("settings.system")}
                active={settings.theme === "system"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "system" }))}
              />
              <IconChoice
                icon={Sun}
                label={t("settings.light")}
                active={settings.theme === "light"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "light" }))}
              />
              <IconChoice
                icon={Moon}
                label={t("settings.dark")}
                active={settings.theme === "dark"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "dark" }))}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle
              icon={Languages}
              title={t("settings.language")}
              description={t("settings.languageDescription")}
            />
            <SelectField
              label={t("settings.language")}
              value={settings.language}
              options={LANGUAGE_OPTIONS}
              onChange={changeLanguage}
            />
            {languageNotice ? (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700" aria-live="polite">
                {languageNotice}
              </p>
            ) : null}
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle icon={LockKeyhole} title={t("settings.security")} description={t("settings.securityDescription")} />
            <div className="space-y-3">
              <ToggleTile
                title={t("settings.localOnly")}
                description={t("settings.localOnlyDescription")}
                checked={settings.localOnly}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, localOnly: checked }))
                }
              />
              <ToggleTile
                title={t("settings.allowExternalAI")}
                description={t("settings.allowExternalAIDescription")}
                checked={settings.allowExternalAI}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, allowExternalAI: checked }))
                }
              />
              <button
                type="button"
                onClick={openCookieSettings}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-app border border-app-border bg-app-bg px-4 text-sm font-semibold text-app-text transition hover:bg-app-hover"
              >
                <ShieldCheck size={16} />
                쿠키 설정
              </button>
              <AuthenticatorSettingsCard />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle icon={Database} title={t("settings.storageStatus")} description={t("settings.storageStatusDescription")} />
            <StorageStatus />
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  description
}: {
  icon: typeof SlidersHorizontal;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
        <Icon size={18} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-app-text">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-app-muted">{description}</p>
      </div>
    </div>
  );
}

function ToggleTile({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-app border border-app-border bg-app-card p-4">
      <span>
        <span className="block text-sm font-semibold text-app-text">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-app-muted">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-app-primary"
      />
    </label>
  );
}

function IconChoice({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: typeof Palette;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-20 flex-col items-center justify-center gap-2 rounded-app border text-xs font-semibold transition ${
        active
          ? "border-app-primary bg-app-hover text-app-primary"
          : "border-app-border bg-app-card text-app-muted hover:bg-app-hover"
      }`}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}

type SelectOption = string | { readonly value: string; readonly label: string };

function SelectField({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-app-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
      >
        {options.map((option) => {
          const optionValue = typeof option === "string" ? option : option.value;
          const optionLabel = typeof option === "string" ? option : option.label;
          return (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-app-muted">{label}</span>
      <input
        type="number"
        min={1}
        max={365}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text outline-none focus:border-app-primary"
      />
    </label>
  );
}

const COMMON_TIMEZONES = [
  "Asia/Seoul",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC"
];

function systemTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function mergeSettings(saved: Partial<LocalSettings>): LocalSettings {
  return {
    ...defaultSettings,
    ...saved,
    // 지원 종료 공급자가 저장돼 있어도 유효한 기본값으로 대체한다.
    provider: normalizeProviderMode(saved.provider),
    integrations: {
      ...defaultSettings.integrations,
      ...saved.integrations
    },
    backup: {
      ...defaultSettings.backup,
      ...saved.backup
    }
  };
}
