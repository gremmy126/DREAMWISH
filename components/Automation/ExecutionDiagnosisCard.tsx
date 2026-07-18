"use client";

import { CircleAlert, Loader2, RotateCcw, Wrench } from "lucide-react";
import { useState } from "react";
import type { ExecutionDiagnosis } from "@/src/lib/automation/runtime/execution-diagnosis.service";

export function ExecutionDiagnosisCard({
  diagnosis,
  queuePosition,
  nextRunAt,
  onRecovered
}: {
  diagnosis: ExecutionDiagnosis | null;
  queuePosition: number | null;
  nextRunAt: string | null;
  onRecovered?: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!diagnosis && queuePosition === null && !nextRunAt) return null;

  async function runAction() {
    if (!diagnosis?.action) return;
    if (diagnosis.action.kind !== "retry") {
      window.location.assign(diagnosis.action.href);
      return;
    }
    setRetrying(true);
    setError(null);
    try {
      const response = await fetch(diagnosis.action.href, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error || "재시도를 등록하지 못했습니다.");
      onRecovered?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "재시도를 등록하지 못했습니다.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <aside className={`rounded-2xl border p-4 ${diagnosis ? "border-amber-200 bg-amber-50/70" : "border-slate-200 bg-slate-50"}`}>
      {diagnosis ? (
        <>
          <div className="flex items-start gap-2">
            <CircleAlert size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900">{diagnosis.title}</p>
              <p className="mt-1 text-[10px] leading-4 text-slate-600"><strong>안전한 원인:</strong> {diagnosis.safeReason}</p>
            </div>
          </div>
          <dl className="mt-3 grid gap-2 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="오류 코드" value={diagnosis.code} />
            <Metric label="실패 Step" value={diagnosis.failingStepId || "-"} />
            <Metric label="API 요청 ID" value={diagnosis.apiRequestId || "-"} />
            <Metric label="Rate Limit" value={diagnosis.rateLimitRemaining ?? "-"} />
            <Metric label="Adapter 지연" value={diagnosis.adapterLatencyMs === null ? "-" : `${diagnosis.adapterLatencyMs}ms`} />
            <Metric label="재시도" value={diagnosis.retryEligible ? diagnosis.retryAt ? new Date(diagnosis.retryAt).toLocaleString("ko-KR") : "가능" : "불가"} />
          </dl>
          <div className="mt-3">
            <p className="text-[10px] font-bold text-slate-700">해결 방법</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4 text-[10px] leading-4 text-slate-600">
              {diagnosis.recoverySteps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </div>
          {diagnosis.action ? (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void runAction()}
              data-action-kind={diagnosis.action.kind}
              className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3 text-[10px] font-bold text-white disabled:opacity-50"
            >
              {retrying ? <Loader2 size={13} className="animate-spin" /> : diagnosis.action.kind === "retry" ? <RotateCcw size={13} /> : <Wrench size={13} />}
              {actionLabel(diagnosis.action.kind)}
            </button>
          ) : null}
          {error ? <p className="mt-2 text-[10px] text-red-700">{error}</p> : null}
        </>
      ) : null}
      {queuePosition !== null || nextRunAt ? (
        <p className={`${diagnosis ? "mt-3 border-t border-amber-200 pt-3" : ""} text-[10px] text-slate-500`}>
          Queue 순서 {queuePosition ?? "확인 중"} · 다음 실행 {nextRunAt ? new Date(nextRunAt).toLocaleString("ko-KR") : "대기 중"}
        </p>
      ) : null}
    </aside>
  );
}

function actionLabel(kind: ExecutionDiagnosis["action"] extends infer T ? T extends { kind: infer K } ? K : never : never) {
  if (kind === "open_connection") return "연결 설정 열기";
  if (kind === "open_admin_health") return "Worker 상태 열기";
  if (kind === "open_node") return "문제 노드 열기";
  return "재시도";
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-white/80 p-2"><dt className="font-bold text-slate-400">{label}</dt><dd className="mt-1 break-all text-slate-700">{value}</dd></div>;
}
