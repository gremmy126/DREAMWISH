"use client";

import type { ConsentDraft } from "./types";

type CookieSettingsProps = {
  draft: ConsentDraft;
  labels: {
    necessaryTitle: string;
    necessaryDescription: string;
    alwaysActive: string;
    analyticsTitle: string;
    analyticsDescription: string;
    adsTitle: string;
    adsDescription: string;
    functionalityTitle: string;
    functionalityDescription: string;
    enabled: string;
    disabled: string;
  };
  onChange: (draft: ConsentDraft) => void;
};

export function CookieSettings({ draft, labels, onChange }: CookieSettingsProps) {
  return (
    <div className="space-y-3">
      <PreferenceRow
        title={labels.necessaryTitle}
        description={labels.necessaryDescription}
        status={labels.alwaysActive}
        checked
        disabled
      />
      <PreferenceRow
        title={labels.analyticsTitle}
        description={labels.analyticsDescription}
        status={draft.analytics ? labels.enabled : labels.disabled}
        checked={draft.analytics}
        onChange={(checked) => onChange({ ...draft, analytics: checked })}
      />
      <PreferenceRow
        title={labels.adsTitle}
        description={labels.adsDescription}
        status={draft.ads ? labels.enabled : labels.disabled}
        checked={draft.ads}
        onChange={(checked) => onChange({ ...draft, ads: checked })}
      />
      <PreferenceRow
        title={labels.functionalityTitle}
        description={labels.functionalityDescription}
        status={draft.functionality ? labels.enabled : labels.disabled}
        checked={draft.functionality}
        onChange={(checked) => onChange({ ...draft, functionality: checked })}
      />
    </div>
  );
}

function PreferenceRow({
  title,
  description,
  status,
  checked,
  disabled = false,
  onChange
}: {
  title: string;
  description: string;
  status: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-app border border-app-border bg-app-bg p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-app-text">{title}</p>
          <span className="rounded-full bg-app-hover px-2 py-1 text-[11px] font-semibold text-app-muted">
            {status}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition focus:outline-none focus:ring-2 focus:ring-app-primary focus:ring-offset-2 focus:ring-offset-app-card ${
          checked ? "bg-blue-600" : "bg-slate-300"
        } ${disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}
