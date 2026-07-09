"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { PanelShell } from "@/components/context/PanelShell";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { SuggestedConnection } from "@/src/lib/connections/connections.types";

export function SuggestedConnectionsPanel({
  suggestions,
  onPreview
}: {
  suggestions: SuggestedConnection[];
  onPreview: (path: string) => void;
}) {
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const { t } = useAppLanguage();

  async function acceptConnection(connection: SuggestedConnection) {
    const response = await fetch("/api/local/connections/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourcePath:
          connection.sourceId === "query" ? connection.targetPath : connection.sourceId,
        targetPath: connection.targetPath,
        targetType: connection.targetType || "document",
        externalTargetId: connection.externalTargetId,
        approved: true
      })
    });
    const data = await response.json();
    setApprovalMessage(data.message || t("context.accepted"));
  }

  return (
    <PanelShell title={t("context.suggested")} icon={Link2}>
      {approvalMessage ? (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
          {approvalMessage}
        </div>
      ) : null}

      {suggestions.length === 0 ? (
        <p className="text-xs leading-5 text-app-muted">{t("context.noSuggestions")}</p>
      ) : (
        <div className="space-y-2">
          {suggestions.slice(0, 5).map((connection) => {
            const opensExternal = connection.targetType === "app" || connection.targetType === "website";
            return (
              <article
                key={`${connection.sourceId}-${connection.targetId}`}
                className="rounded-2xl border border-app-border bg-app-bg p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-app-text">
                    {connection.targetTitle}
                  </p>
                  <span className="text-[11px] font-semibold text-app-primary">
                    {Math.round(connection.strength * 100)}%
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-app-muted">
                  {connection.targetPath}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {connection.reason}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => acceptConnection(connection)}
                    className="rounded-xl bg-app-primary px-3 py-1.5 text-[11px] font-semibold text-white"
                  >
                    {t("context.accept")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (opensExternal) {
                        window.open(connection.targetPath, "_blank", "noreferrer");
                        return;
                      }
                      onPreview(connection.targetPath);
                    }}
                    className="rounded-xl border border-app-border bg-white px-3 py-1.5 text-[11px] font-semibold text-app-muted hover:bg-app-hover"
                  >
                    {opensExternal ? t("context.openApp") : t("context.openDocument")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PanelShell>
  );
}
