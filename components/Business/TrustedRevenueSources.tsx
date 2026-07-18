"use client";

import { useEffect, useMemo, useState } from "react";
import type { RevenueCandidate } from "@/src/lib/business/revenue.types";

type Rule = { sourceApp: string; enabled: boolean; autoConfirmHighConfidence: boolean };

export function TrustedRevenueSources({ candidates }: { candidates: RevenueCandidate[] }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const sources = useMemo(() => [...new Set(candidates.filter(item => item.platform === "android").map(item => item.sourceApp))].sort(), [candidates]);
  async function load() {
    const response = await fetch("/api/business/revenue/trusted-sources", { cache: "no-store" });
    const body = await response.json().catch(() => null) as { rules?: Rule[] } | null;
    if (response.ok) setRules(body?.rules || []);
  }
  useEffect(() => { void load(); }, []);

  async function toggle(sourceApp: string, enabled: boolean) {
    const response = await fetch("/api/business/revenue/trusted-sources", {
      method: enabled ? "PUT" : "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enabled ? { sourceApp, acknowledged: true } : { sourceApp })
    });
    if (!response.ok) setMessage("신뢰 소스 설정을 변경하지 못했습니다.");
    else { setMessage(enabled ? "고신뢰 입금만 자동 확정합니다." : "자동 확정을 즉시 중지했습니다."); await load(); }
  }

  if (sources.length === 0) return null;
  return <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
    <h3 className="text-sm font-bold text-app-text">신뢰 Android 소스</h3>
    <p className="mt-1 text-xs leading-5 text-app-muted">직접 허용한 앱의 신뢰도 90% 이상 입금만 자동 확정합니다. 비용·취소·모호한 알림은 항상 검토 대기입니다.</p>
    <label className="mt-3 flex items-start gap-2 text-xs text-app-text"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5" />알림 문구가 실제 거래와 다를 수 있으며 자동 확정 결과를 언제든 되돌릴 수 있음을 확인했습니다.</label>
    <div className="mt-3 flex flex-wrap gap-2">{sources.map(source => {
      const enabled = Boolean(rules.find(rule => rule.sourceApp === source)?.enabled);
      return <button key={source} type="button" disabled={!enabled && !acknowledged} onClick={() => void toggle(source, !enabled)} className={`min-h-11 rounded-xl border px-3 text-xs font-bold ${enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-app-border bg-white text-app-muted"}`}>{source} · {enabled ? "자동 확정 켜짐" : "꺼짐"}</button>;
    })}</div>
    {message ? <p role="status" className="mt-3 text-xs text-app-muted">{message}</p> : null}
  </section>;
}
