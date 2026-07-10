"use client";

import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function ExternalDataPreview({
  preview
}: {
  preview: ConnectorExecutionPreview | null;
}) {
  const { t } = useAppLanguage();

  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <h3 className="text-sm font-semibold text-app-text">{t("integrations.externalDataPreview")}</h3>
      {preview ? (
        <dl className="mt-3 space-y-2 text-xs">
          <PreviewRow label={t("integrations.readableData")} value={preview.readableData.join(", ") || "-"} />
          <PreviewRow label={t("integrations.createdData")} value={preview.createdData.join(", ") || "-"} />
          <PreviewRow label={t("integrations.recordLocation")} value={preview.recordLocation} />
        </dl>
      ) : (
        <p className="mt-2 text-xs leading-5 text-app-muted">
          {t("integrations.previewEmpty")}
        </p>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg px-3 py-2">
      <dt className="font-semibold text-app-muted">{label}</dt>
      <dd className="text-right font-medium text-app-text">{value}</dd>
    </div>
  );
}
