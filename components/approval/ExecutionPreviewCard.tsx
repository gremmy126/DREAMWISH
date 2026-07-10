"use client";

import { ShieldCheck } from "lucide-react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";
import { RiskBadge } from "./RiskBadge";

export function ExecutionPreviewCard({
  preview
}: {
  preview: ConnectorExecutionPreview | null;
}) {
  const { t } = useAppLanguage();

  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-app-primary" />
          <h3 className="text-sm font-semibold text-app-text">{t("integrations.preview")}</h3>
        </div>
        {preview ? <RiskBadge risk={preview.riskLevel} /> : null}
      </div>
      {preview ? (
        <div className="space-y-2 text-xs text-app-muted">
          <p className="font-semibold text-app-text">{preview.goal}</p>
          <p>{t("integrations.service")}: {preview.connectorId}</p>
          <p>{t("integrations.approvalRequiredLabel")}: {preview.approvalRequired ? t("integrations.yes") : t("integrations.no")}</p>
          <p>{t("integrations.reversible")}: {preview.reversible ? t("integrations.reversibleYes") : t("integrations.reversibleNo")}</p>
        </div>
      ) : (
        <p className="text-xs leading-5 text-app-muted">
          {t("integrations.executionPreviewEmpty")}
        </p>
      )}
    </div>
  );
}
