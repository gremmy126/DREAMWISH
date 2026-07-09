"use client";

import { Play } from "lucide-react";
import { useState } from "react";

export function MockConnectorPanel({ connectorId }: { connectorId: string }) {
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    const response = await fetch(`/api/integrations/${connectorId}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: 30, limit: 10 })
    });
    const sync = (await response.json()) as {
      status: string;
      normalizedCount: number;
      message: string;
    };
    setResult(
      sync.status === "success"
        ? `${sync.normalizedCount}개 항목을 정규화했습니다.`
        : sync.message
    );
  }

  return (
    <div className="rounded-app border border-app-border bg-app-bg p-4">
      <button
        type="button"
        onClick={() => void run()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-app-border bg-white px-4 py-3 text-sm font-semibold text-app-text hover:bg-app-hover"
      >
        <Play size={15} />
        Sync 실행
      </button>
      {result ? <p className="mt-3 text-xs leading-5 text-app-muted">{result}</p> : null}
    </div>
  );
}
