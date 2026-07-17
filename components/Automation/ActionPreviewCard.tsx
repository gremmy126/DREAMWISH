import { buildActionPreview } from "@/src/lib/automation/action-ui-model";
import type { ActionValue } from "@/src/lib/automation/registry/action.types";

const riskStyle = {
  read: "bg-slate-100 text-slate-600",
  low: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700"
};

export function ActionPreviewCard({ appId, actionId, actionVersion, input }: { appId: string; actionId: string; actionVersion?: number | null; input: Record<string, ActionValue> }) {
  const preview = buildActionPreview(appId, actionId, actionVersion || undefined, input);
  if (!preview) return null;
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div><p className="text-[11px] font-bold text-slate-700">Preview</p><p className="mt-1 text-[10px] text-slate-500">{preview.title}</p></div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${riskStyle[preview.riskLevel]}`}>{preview.riskLevel}</span>
      </div>
      <dl className="mt-3 space-y-2">
        {Object.entries(preview.targetValues).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-3 text-[10px]"><dt className="text-slate-400">{key}</dt><dd className="max-w-[65%] break-all text-right font-semibold text-slate-700">{format(value)}</dd></div>)}
        <div className="flex justify-between gap-3 text-[10px]"><dt className="text-slate-400">되돌리기</dt><dd className="font-semibold text-slate-700">{preview.reversible === true ? "가능" : preview.reversible === false ? "어려움" : "실행 시 확인"}</dd></div>
      </dl>
      <p className="mt-3 text-[10px] leading-4 text-slate-500">실패 영향: {preview.failureImpact}</p>
      {preview.confirmationPhrase ? <p className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-700">최종 승인 확인 문구: {preview.confirmationPhrase}</p> : null}
    </section>
  );
}

function format(value: ActionValue | undefined) {
  if (value === undefined || value === null || value === "") return "미입력";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
