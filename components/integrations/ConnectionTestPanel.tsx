"use client";

import { Loader2, PlugZap } from "lucide-react";
import { useState } from "react";
import type { Connector } from "@/src/lib/integrations/types";

export function ConnectionTestPanel({ connector }: { connector: Connector }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function test() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectorId: connector.id })
      });
      const result = (await response.json()) as { message?: string };
      setMessage(result.message || "Connection test completed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <button
        type="button"
        onClick={() => void test()}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-app-primary px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-200"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <PlugZap size={16} />}
        연결 테스트
      </button>
      {message ? <p className="mt-3 text-xs leading-5 text-app-muted">{message}</p> : null}
    </div>
  );
}
