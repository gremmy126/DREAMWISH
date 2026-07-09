"use client";

import { useEffect, useState } from "react";

type SyncHistoryRow = {
  historyId: string;
  connectorId: string;
  status: string;
  normalizedCount: number;
  ranAt: string;
};

export function SyncHistoryTable() {
  const [rows, setRows] = useState<SyncHistoryRow[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/integrations/sync-history");
      const data = (await response.json()) as { history?: SyncHistoryRow[] };
      setRows(data.history || []);
    }
    void load();
  }, []);

  return (
    <div className="overflow-hidden rounded-app border border-app-border bg-white">
      <div className="grid grid-cols-[1fr_90px_80px_120px] border-b border-app-border bg-app-bg px-4 py-3 text-xs font-semibold text-app-muted">
        <span>Connector</span>
        <span>Status</span>
        <span>Rows</span>
        <span>Time</span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-5 text-xs text-app-muted">
          아직 Sync 기록이 없습니다.
        </div>
      ) : (
        rows.map((row) => (
          <div
            key={row.historyId}
            className="grid grid-cols-[1fr_90px_80px_120px] border-b border-app-border px-4 py-3 text-xs last:border-b-0"
          >
            <span className="font-semibold text-app-text">{row.connectorId}</span>
            <span className={row.status === "success" ? "text-emerald-600" : "text-amber-600"}>
              {row.status}
            </span>
            <span className="text-app-muted">{row.normalizedCount}</span>
            <span className="text-app-muted">
              {new Date(row.ranAt).toLocaleString("ko-KR")}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
