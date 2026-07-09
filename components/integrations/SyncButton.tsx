"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function SyncButton({ connectorId }: { connectorId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    fetch("/api/integrations/settings")
      .then((response) => response.json())
      .then((data: { settings?: Array<{ connectorId: string; enabled: boolean }> }) => {
        setEnabled(Boolean(data.settings?.find((item) => item.connectorId === connectorId)?.enabled));
      })
      .catch(() => undefined);
  }, [connectorId]);

  async function sync() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/integrations/${connectorId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30, limit: 20 })
      });
      const data = (await response.json()) as { message?: string; normalizedCount?: number };
      setMessage(data.message || `${data.normalizedCount || 0}개 항목을 동기화했습니다.`);
      await saveSetting(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveSetting(nextEnabled: boolean) {
    setEnabled(nextEnabled);
    await fetch("/api/integrations/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectorId,
        enabled: nextEnabled,
        syncDays: 30,
        commandPrefix: connectorId === "gmail" ? "Gmail" : connectorId === "calendar" ? "Calendar" : connectorId === "slack" ? "Slack" : connectorId
      })
    });
  }

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <button
          type="button"
          onClick={() => void sync()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-text hover:bg-app-hover disabled:text-app-muted"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          최근 30일 Sync
        </button>
        <label className="inline-flex h-10 items-center gap-2 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-muted">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => void saveSetting(event.target.checked)}
            className="accent-app-primary"
          />
          Chat
        </label>
      </div>
      {message ? <p className="mt-2 text-xs leading-5 text-app-muted">{message}</p> : null}
    </div>
  );
}
