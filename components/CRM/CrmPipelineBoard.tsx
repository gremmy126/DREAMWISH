"use client";

import { BriefcaseBusiness } from "lucide-react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { CrmDeal, DealStage } from "@/src/lib/crm/crm.types";

const stages: Array<{ id: DealStage; label: string; accent: string }> = [
  { id: "discovery", label: "신규", accent: "bg-blue-500" },
  { id: "contacted", label: "접촉됨", accent: "bg-indigo-500" },
  { id: "proposal", label: "제안", accent: "bg-violet-500" },
  { id: "negotiation", label: "협상", accent: "bg-amber-500" },
  { id: "won", label: "성사", accent: "bg-emerald-500" }
];

export function CrmPipelineBoard({ deals }: { deals: CrmDeal[] }) {
  return (
    <SurfaceCard className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-app-border px-5 py-4">
        <div className="flex items-center gap-2"><BriefcaseBusiness size={17} className="text-app-primary" /><h2 className="text-sm font-semibold text-app-text">딜 파이프라인</h2></div>
        <span className="text-xs text-app-muted">{deals.filter((deal) => deal.stage !== "lost").length}건</span>
      </div>
      <div className="grid min-w-[780px] grid-cols-5 gap-px overflow-x-auto bg-app-border">
        {stages.map((stage) => {
          const items = deals.filter((deal) => normalizeStage(deal.stage) === stage.id);
          const value = items.reduce((sum, deal) => sum + deal.value, 0);
          return (
            <section key={stage.id} className="min-h-52 bg-white p-3">
              <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-xs font-semibold text-app-text"><span className={`h-2 w-2 rounded-full ${stage.accent}`} />{stage.label}</span><span className="text-[10px] text-app-muted">{items.length}</span></div>
              <p className="mt-1 text-[10px] text-app-muted">{formatCurrency(value)}</p>
              <div className="mt-3 space-y-2">{items.slice(0, 4).map((deal) => <article key={deal.id} className="rounded-xl border border-app-border bg-app-bg p-2.5"><p className="line-clamp-2 text-xs font-semibold text-app-text">{deal.title}</p><p className="mt-1 text-[10px] text-app-muted">{formatCurrency(deal.value)} · {deal.probability}%</p></article>)}</div>
              {items.length === 0 ? <p className="mt-8 text-center text-[10px] text-app-muted">딜 없음</p> : null}
            </section>
          );
        })}
      </div>
    </SurfaceCard>
  );
}

function normalizeStage(stage: DealStage): DealStage {
  return stage === "lost" ? "discovery" : stage;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(value);
}
