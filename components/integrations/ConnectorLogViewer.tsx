"use client";

import { useEffect, useState } from "react";

type ConnectorLog = {
  historyId: string;
  message: string;
};

export function ConnectorLogViewer() {
  const [logs, setLogs] = useState<ConnectorLog[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/integrations/sync-history");
      const data = (await response.json()) as { history?: ConnectorLog[] };
      setLogs(data.history || []);
    }
    void load();
  }, []);

  return (
    <div className="rounded-app border border-app-border bg-slate-950 p-4 text-xs text-slate-100">
      {logs.length === 0 ? (
        <p className="leading-6 text-slate-400">Connector 실행 로그가 없습니다.</p>
      ) : (
        logs.map((log, index) => (
          <p key={log.historyId} className="leading-6">
            <span className="text-slate-500">{String(index + 1).padStart(2, "0")}</span>{" "}
            {log.message}
          </p>
        ))
      )}
    </div>
  );
}
