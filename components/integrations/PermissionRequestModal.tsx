"use client";

import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function PermissionRequestModal({
  preview,
  onClose
}: {
  preview: ConnectorExecutionPreview | null;
  onClose: () => void;
}) {
  const { t } = useAppLanguage();

  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-[520px] rounded-app border border-app-border bg-white p-5 shadow-app">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-app-text">{t("integrations.preview")}</h2>
            <p className="mt-1 text-sm text-app-muted">{preview.goal}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted hover:bg-app-hover"
          >
            {t("common.close")}
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <PreviewRow label="Connector" value={preview.connectorId} />
          <PreviewRow label={t("integrations.risk")} value={preview.riskLevel} />
          <PreviewRow label={t("integrations.record")} value={preview.recordLocation} />
          <PreviewRow
            label={t("integrations.approval")}
            value={preview.approvalRequired ? t("integrations.required") : t("integrations.notRequired")}
          />
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-app-border bg-app-bg px-3 py-3">
      <span className="text-xs font-semibold text-app-muted">{label}</span>
      <span className="text-sm font-semibold text-app-text">{value}</span>
    </div>
  );
}
