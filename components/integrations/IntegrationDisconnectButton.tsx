"use client";

import { Unplug } from "lucide-react";
import { useState } from "react";

export function IntegrationDisconnectButton({
  provider
}: {
  provider: "google" | "slack";
}) {
  const [message, setMessage] = useState<string | null>(null);

  async function disconnect() {
    const response = await fetch(`/api/oauth/${provider}/disconnect`, { method: "POST" });
    const data = (await response.json()) as { revoked?: boolean };
    setMessage(data.revoked ? "연결을 해제했습니다." : "저장된 연결이 없습니다.");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void disconnect()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted hover:bg-red-50 hover:text-red-600"
      >
        <Unplug size={14} />
        연결 해제
      </button>
      {message ? <p className="mt-2 text-xs leading-5 text-app-muted">{message}</p> : null}
    </div>
  );
}
