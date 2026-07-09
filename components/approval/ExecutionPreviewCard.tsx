import { ShieldCheck } from "lucide-react";
import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";
import { RiskBadge } from "./RiskBadge";

export function ExecutionPreviewCard({
  preview
}: {
  preview: ConnectorExecutionPreview | null;
}) {
  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={15} className="text-app-primary" />
          <h3 className="text-sm font-semibold text-app-text">Execution Preview</h3>
        </div>
        {preview ? <RiskBadge risk={preview.riskLevel} /> : null}
      </div>
      {preview ? (
        <div className="space-y-2 text-xs text-app-muted">
          <p className="font-semibold text-app-text">{preview.goal}</p>
          <p>서비스: {preview.connectorId}</p>
          <p>승인 필요: {preview.approvalRequired ? "예" : "아니오"}</p>
          <p>되돌리기: {preview.reversible ? "가능" : "어려움"}</p>
        </div>
      ) : (
        <p className="text-xs leading-5 text-app-muted">
          실행 전 Planner, Permission Check, Preview, Approval 순서로 표시됩니다.
        </p>
      )}
    </div>
  );
}
