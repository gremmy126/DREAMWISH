"use client";

import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { ExecutionPreviewCard } from "./ExecutionPreviewCard";

export function ApprovalModal({
  preview,
  onApprove,
  onReject,
  onClose
}: {
  preview: ConnectorExecutionPreview | null;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  const { t } = useAppLanguage();

  if (!preview) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
      <div className="w-[540px] rounded-app border border-app-border bg-white p-5 shadow-app">
        <ExecutionPreviewCard preview={preview} />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onReject}
            className="rounded-2xl border border-app-border px-4 py-2 text-xs font-semibold text-app-muted hover:bg-app-hover"
          >
            {t("integrations.reject")}
          </button>
          <button
            type="button"
            onClick={onApprove}
            className="rounded-2xl bg-app-primary px-4 py-2 text-xs font-semibold text-white"
          >
            {t("integrations.approve")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-app-border px-4 py-2 text-xs font-semibold text-app-muted hover:bg-app-hover"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
