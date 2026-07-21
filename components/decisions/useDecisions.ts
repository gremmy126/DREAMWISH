"use client";

import { useCallback, useEffect, useState } from "react";
import type { Decision } from "@/src/lib/decisions/decision.types";

export function useDecisions() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/decisions", { cache: "no-store" });
      if (!response.ok) throw new Error("결정 목록을 불러오지 못했습니다.");
      const body = (await response.json()) as { decisions: Decision[] };
      setDecisions(body.decisions || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결정 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { decisions, loading, error, reload, setDecisions };
}

export async function patchDecision(
  decisionId: string,
  patch: Partial<Decision>
): Promise<Decision> {
  const response = await fetch(`/api/decisions/${decisionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  const body = (await response.json().catch(() => ({}))) as {
    decision?: Decision;
    error?: string;
  };
  if (!response.ok || !body.decision) {
    throw new Error(body.error || "결정을 저장하지 못했습니다.");
  }
  return body.decision;
}

export function navigateWorkspace(view: string) {
  window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view } }));
}
