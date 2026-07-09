"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  connectorId: string;
  actionType: string;
  status: string;
};

export function ApprovalQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/approvals/execution-links");
      const data = (await response.json()) as { links?: QueueItem[] };
      setQueue(data.links || []);
    }
    void load();
  }, []);

  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock3 size={15} className="text-app-primary" />
        <h3 className="text-sm font-semibold text-app-text">Approval Queue</h3>
      </div>
      <div className="space-y-2">
        {queue.length === 0 ? (
          <p className="text-xs leading-5 text-app-muted">
            승인 대기 실행이 없습니다.
          </p>
        ) : (
          queue.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-xs"
            >
              <span className="font-semibold text-app-text">
                {item.connectorId} · {item.actionType}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-700">
                {item.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
