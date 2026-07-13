"use client";

import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/context/PanelShell";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { SuggestedConnection } from "@/src/lib/connections/connections.types";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import type { VerifiedConnectionState } from "@/src/lib/integrations/verified-connection.service";

export function SuggestedConnectionsPanel({
  suggestions,
  onPreview
}: {
  suggestions: SuggestedConnection[];
  onPreview: (path: string) => void;
}) {
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null);
  const [connections, setConnections] = useState<VerifiedConnectionState[]>([]);
  const { t } = useAppLanguage();

  useEffect(() => { void loadConnections(); }, []);

  async function loadConnections() {
    const response = await fetch("/api/integrations/status");
    const data = await response.json().catch(() => ({})) as { connections?: VerifiedConnectionState[] };
    if (response.ok) setConnections(data.connections || []);
  }

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
    if (data.connectionRequired && data.connectorId) {
      window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "integrations", connectorId: data.connectorId } }));
    }
    if (data.applied) await loadConnections();
  }

  async function disconnectConnection(connectorId: string, state: VerifiedConnectionState) {
    const app = getAutomationApp(connectorId);
    const target = app?.oauthTarget;
    const response = state.authMode === "oauth" && target
      ? await fetch(`/api/integrations/${encodeURIComponent(target.provider)}/disconnect?service=${encodeURIComponent(target.service)}`, { method: "POST" })
      : await fetch(`/api/integrations/credentials/${encodeURIComponent(connectorId)}`, { method: "DELETE" });
    if (response.ok) {
      setApprovalMessage(`${app?.label || connectorId} 연결을 해제했습니다.`);
      await loadConnections();
    }
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
            const connectorId = connection.externalTargetId || connection.targetId;
            const verified = connections.find((item) => item.connectorId === connectorId && item.status === "connected");
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
                    onClick={() => verified ? void disconnectConnection(connectorId, verified) : void acceptConnection(connection)}
                    className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold ${verified ? "border border-red-200 bg-white text-red-600" : "bg-app-primary text-white"}`}
                  >
                    {verified ? "연결 해제" : "연결하기"}
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
