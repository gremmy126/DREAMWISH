"use client";

import { AlertTriangle, Check, Copy, ReceiptText, X } from "lucide-react";
import type { RevenueCandidate, RevenueCandidateStatus } from "@/src/lib/business/revenue.types";
import { TrustedRevenueSources } from "./TrustedRevenueSources";

export function RevenueReviewPanel({ candidates, onTransition }: {
  candidates: RevenueCandidate[];
  onTransition: (id: string, status: Exclude<RevenueCandidateStatus, "provisional">, linkedCandidateId?: string) => void;
}) {
  const pending = candidates.filter(candidate => candidate.status === "provisional");
  if (candidates.length === 0) return <section className="rounded-app border border-app-border bg-white p-10 text-center shadow-soft"><ReceiptText size={28} className="mx-auto text-app-primary" /><p className="mt-3 text-sm text-app-muted">수집된 매출 후보가 없습니다.</p></section>;
  return <div className="space-y-4">
    <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-app-text">확인 대기 매출</h2><p className="mt-1 text-xs text-app-muted">확정 전에는 매출 KPI에 포함되지 않습니다.</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">{pending.length}건</span></div>
      <div className="mt-4 space-y-3">{candidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} candidates={candidates} onTransition={onTransition} />)}</div>
    </section>
    <TrustedRevenueSources candidates={candidates} />
  </div>;
}

function CandidateCard({ candidate, candidates, onTransition }: {
  candidate: RevenueCandidate; candidates: RevenueCandidate[];
  onTransition: (id: string, status: Exclude<RevenueCandidateStatus, "provisional">, linkedCandidateId?: string) => void;
}) {
  const possibleOriginal = candidate.direction === "cancellation"
    ? candidates.find(item => item.id !== candidate.id && item.amount === candidate.amount && item.status === "confirmed")
    : null;
  return <article className="rounded-2xl border border-app-border bg-app-bg p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-base font-black text-app-text">{candidate.amount === null ? "금액 확인 필요" : `${candidate.amount.toLocaleString("ko-KR")}원`}</p>
        <p className="mt-1 break-all text-xs text-app-muted">{candidate.sourceApp} · {new Date(candidate.capturedAt).toLocaleString("ko-KR")}</p>
        <p className="mt-1 text-xs text-app-muted">{directionLabel(candidate.direction)} · {candidate.counterpartyHint || "상대방 확인 필요"} · 신뢰도 {Math.round(candidate.confidence * 100)}%</p>
      </div>
      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-app-muted">{statusLabel(candidate.status)}</span>
    </div>
    {candidate.direction === "cancellation" ? <p className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} />취소 신호입니다. 원 거래와 연결한 뒤 처리하세요.</p> : null}
    {candidate.status === "provisional" ? <div className="mt-4 flex flex-wrap gap-2">
      <Action icon={<Check size={13} />} label="매출 확정" onClick={() => onTransition(candidate.id, "confirmed")} primary />
      <Action label="비용으로 변경" onClick={() => onTransition(candidate.id, "expense")} />
      <Action label="개인 거래" onClick={() => onTransition(candidate.id, "personal")} />
      <Action icon={<Copy size={13} />} label="중복" onClick={() => onTransition(candidate.id, "duplicate", possibleOriginal?.id)} />
      <Action icon={<X size={13} />} label="제외·오류" onClick={() => onTransition(candidate.id, "rejected")} />
    </div> : null}
  </article>;
}

function Action({ label, onClick, icon, primary = false }: { label: string; onClick: () => void; icon?: React.ReactNode; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${primary ? "bg-emerald-600 text-white" : "border border-app-border bg-white text-app-muted"}`}>{icon}{label}</button>;
}
function directionLabel(value: RevenueCandidate["direction"]) { return value === "income" ? "입금" : value === "expense" ? "지출" : value === "cancellation" ? "취소" : "방향 미확인"; }
function statusLabel(value: RevenueCandidateStatus) { return ({ provisional: "검토 대기", confirmed: "매출 확정", expense: "비용", personal: "개인", duplicate: "중복", rejected: "제외" })[value]; }
