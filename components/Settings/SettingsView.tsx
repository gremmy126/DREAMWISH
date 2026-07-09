"use client";

import {
  Bot,
  CheckCircle2,
  CreditCard,
  Database,
  HardDrive,
  KeyRound,
  Languages,
  LockKeyhole,
  Moon,
  Palette,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  TimerReset,
  Workflow
} from "lucide-react";
import { useEffect, useState } from "react";
import { StorageStatus } from "@/components/Common/StorageStatus";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { defaultPermissionPolicy } from "@/src/lib/security/permission-policy";
import { listPaymentProviders, type PaymentProviderId } from "@/src/lib/payments/payment.types";
import { POLAR_CHECKOUT_SETTINGS } from "@/src/lib/payments/polar.config";
import {
  APP_SETTINGS_STORAGE_KEY,
  LANGUAGE_OPTIONS,
  applyDocumentLanguage,
  emitLanguagePreferenceChange,
  resolveThemePreference
} from "@/src/lib/settings/app-preferences";

type ThemeMode = "system" | "light" | "dark";
type ProviderMode =
  | "groq"
  | "gemini"
  | "openrouter"
  | "huggingface"
  | "cloudflare";
type LanguageMode = "ko" | "en" | "ja";
type BackupInterval = "manual" | "hourly" | "daily" | "weekly";

const SETTINGS_KEY = APP_SETTINGS_STORAGE_KEY;

type LocalSettings = {
  theme: ThemeMode;
  provider: ProviderMode;
  language: LanguageMode;
  storagePath: string;
  localOnly: boolean;
  allowExternalAI: boolean;
  integrations: {
    mockMode: boolean;
    autoSync: boolean;
    approvalRequiredFrom: "high" | "critical";
    retentionDays: number;
  };
  payments: {
    domestic: PaymentProviderId;
    international: PaymentProviderId;
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
  storagePath: "SecondBrain",
  localOnly: false,
  allowExternalAI: true,
  integrations: {
    mockMode: defaultPermissionPolicy.mockMode,
    autoSync: defaultPermissionPolicy.autoSync,
    approvalRequiredFrom: "high",
    retentionDays: 90
  },
  payments: {
    domestic: "kg_inicis",
    international: "polar"
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
  "groq",
  "gemini",
  "openrouter",
  "huggingface",
  "cloudflare"
];

const sections = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "models", label: "AI Models", icon: Bot },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "integrations", label: "Integrations", icon: Workflow },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "payments", label: "Payments", icon: CreditCard }
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
  const [paymentState, setPaymentState] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: false, error: null });

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

      if (!response.ok) throw new Error(data.error || "백업에 실패했습니다.");
      setSettings((prev) => ({
        ...prev,
        backup: {
          ...prev.backup,
          lastBackupAt: data.createdAt || new Date().toISOString(),
          lastBackupPath: data.backupPath || null
        }
      }));
      setBackupState({ loading: false, message: "로컬 백업을 만들었습니다.", error: null });
    } catch (error) {
      setBackupState({
        loading: false,
        message: null,
        error: error instanceof Error ? error.message : "백업에 실패했습니다."
      });
    }
  }

  async function startCheckout() {
    setPaymentState({ loading: true, error: null });
    try {
      const response = await fetch("/api/payments/polar/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || "Payment checkout could not be created.");
      }
      window.location.href = data.checkoutUrl;
    } catch (error) {
      setPaymentState({
        loading: false,
        error: error instanceof Error ? error.message : "Payment checkout failed."
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-app-text">Settings</h1>
          <p className="mt-2 text-sm text-app-muted">
            AI 모델, 저장소, Integration 권한, 결제 라우팅을 한 곳에서 조정합니다.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-2 rounded-2xl bg-app-primary px-4 text-sm font-semibold text-white shadow-soft"
        >
          <Save size={16} />
          설정 저장됨
        </button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_330px] gap-5">
        <div className="space-y-5">
          <SurfaceCard className="p-6">
            <PanelTitle
              icon={Bot}
              title="AI Models"
              description="AI Chat에서 Mock과 Ollama를 제외하고 사용할 Provider입니다."
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
                      : "border-app-border bg-white hover:bg-app-hover"
                  }`}
                >
                  <p className="text-sm font-semibold text-app-text">{provider}</p>
                  <p className="mt-1 text-xs leading-5 text-app-muted">
                    무료/외부 Provider
                  </p>
                </button>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <PanelTitle
              icon={Workflow}
              title="Integrations"
              description="Mock Mode, 자동 동기화, 승인 정책, 로그 보존 기간을 설정합니다."
            />
            <div className="grid grid-cols-2 gap-3">
              <ToggleTile
                title="Mock Mode"
                description="실제 외부 API 대신 Mock Connector만 사용합니다."
                checked={settings.integrations.mockMode}
                onChange={(checked) =>
                  setSettings((prev) => ({
                    ...prev,
                    integrations: { ...prev.integrations, mockMode: checked }
                  }))
                }
              />
              <ToggleTile
                title="Auto Sync"
                description="이번 단계에서는 설정만 저장하고 실제 주기 실행은 하지 않습니다."
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
                label="승인 필수 위험도"
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
                label="외부 데이터 보존일"
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
              icon={CreditCard}
              title="Payments"
              description="국내 결제는 KG이니시스, 해외 결제는 Polar $19 단일 상품으로 라우팅합니다."
            />
            <div className="grid grid-cols-2 gap-3">
              {listPaymentProviders().map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-app border border-app-border bg-white p-4 shadow-soft"
                >
                  <p className="text-xs font-semibold uppercase text-app-muted">
                    {provider.market}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-app-text">
                    {provider.label}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-app-muted">
                    {provider.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-[1fr_1fr_auto] gap-3">
              <SelectField
                label="Domestic"
                value={settings.payments.domestic}
                options={listPaymentProviders()
                  .filter((provider) => provider.market === "domestic")
                  .map((provider) => provider.id)}
                onChange={(domestic) =>
                  setSettings((prev) => ({
                    ...prev,
                    payments: { ...prev.payments, domestic: domestic as PaymentProviderId }
                  }))
                }
              />
              <SelectField
                label="International"
                value={settings.payments.international}
                options={listPaymentProviders()
                  .filter((provider) => provider.market === "international")
                  .map((provider) => provider.id)}
                onChange={(international) =>
                  setSettings((prev) => ({
                    ...prev,
                    payments: {
                      ...prev.payments,
                      international: international as PaymentProviderId
                    }
                  }))
                }
              />
              <button
                type="button"
                onClick={() => void startCheckout()}
                disabled={paymentState.loading}
                className="mt-6 h-11 rounded-app bg-app-primary px-4 text-sm font-semibold text-white disabled:bg-slate-200"
              >
                {paymentState.loading ? "Opening" : "Pay"}
              </button>
            </div>
            {paymentState.error ? (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {paymentState.error}
              </p>
            ) : null}
            <div className="mt-4 grid gap-2 rounded-app border border-app-border bg-app-bg p-4 text-xs">
              <SettingsUrl label="Polar 성공 URL" value={POLAR_CHECKOUT_SETTINGS.successUrl} />
              <SettingsUrl label="Polar 반환 URL" value={POLAR_CHECKOUT_SETTINGS.returnUrl} />
              <SettingsUrl label="Polar 웹훅 URL" value={POLAR_CHECKOUT_SETTINGS.webhookUrl} />
              <SettingsUrl
                label="Polar 상품"
                value={`${POLAR_CHECKOUT_SETTINGS.planName} - $${POLAR_CHECKOUT_SETTINGS.amountUsd}`}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <PanelTitle
              icon={HardDrive}
              title="Storage & Backup"
              description="Local First 저장소와 백업 경로입니다."
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
                지금 백업
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
            <PanelTitle icon={Palette} title="Appearance" description="표시 환경" />
            <div className="grid grid-cols-3 gap-2">
              <IconChoice
                icon={Palette}
                label="System"
                active={settings.theme === "system"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "system" }))}
              />
              <IconChoice
                icon={Sun}
                label="Light"
                active={settings.theme === "light"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "light" }))}
              />
              <IconChoice
                icon={Moon}
                label="Dark"
                active={settings.theme === "dark"}
                onClick={() => setSettings((prev) => ({ ...prev, theme: "dark" }))}
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle
              icon={Languages}
              title="Language"
              description="사이트 언어를 한국어, English, 日本語 중에서 선택합니다."
            />
            <SelectField
              label="Language"
              value={settings.language}
              options={LANGUAGE_OPTIONS}
              onChange={(value) =>
                setSettings((prev) => ({ ...prev, language: value as LanguageMode }))
              }
            />
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle icon={LockKeyhole} title="Security" description="외부 호출 정책" />
            <div className="space-y-3">
              <ToggleTile
                title="로컬 전용"
                description="켜면 외부 AI 호출을 제한합니다."
                checked={settings.localOnly}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, localOnly: checked }))
                }
              />
              <ToggleTile
                title="외부 AI 허용"
                description="선택한 무료 Provider 호출을 허용합니다."
                checked={settings.allowExternalAI}
                onChange={(checked) =>
                  setSettings((prev) => ({ ...prev, allowExternalAI: checked }))
                }
              />
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <PanelTitle icon={Database} title="Storage Status" description="로컬 저장소" />
            <StorageStatus />
          </SurfaceCard>
        </div>
      </div>
    </div>
  );
}

function SettingsUrl({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
      <span className="font-semibold text-app-muted">{label}</span>
      <span className="break-all font-medium text-app-text">{value}</span>
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
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-app border border-app-border bg-white p-4">
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
          : "border-app-border bg-white text-app-muted hover:bg-app-hover"
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

function mergeSettings(saved: Partial<LocalSettings>): LocalSettings {
  return {
    ...defaultSettings,
    ...saved,
    integrations: {
      ...defaultSettings.integrations,
      ...saved.integrations
    },
    payments: {
      ...defaultSettings.payments,
      ...saved.payments
    },
    backup: {
      ...defaultSettings.backup,
      ...saved.backup
    }
  };
}
