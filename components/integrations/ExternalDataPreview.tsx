import type { ConnectorExecutionPreview } from "@/src/lib/integrations/types";

export function ExternalDataPreview({
  preview
}: {
  preview: ConnectorExecutionPreview | null;
}) {
  return (
    <div className="rounded-app border border-app-border bg-white p-4">
      <h3 className="text-sm font-semibold text-app-text">External Data Preview</h3>
      {preview ? (
        <dl className="mt-3 space-y-2 text-xs">
          <PreviewRow label="읽을 데이터" value={preview.readableData.join(", ") || "-"} />
          <PreviewRow label="생성 데이터" value={preview.createdData.join(", ") || "-"} />
          <PreviewRow label="저장 위치" value={preview.recordLocation} />
        </dl>
      ) : (
        <p className="mt-2 text-xs leading-5 text-app-muted">
          실행 미리보기를 만들면 읽기/쓰기 범위와 저장 위치가 표시됩니다.
        </p>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg px-3 py-2">
      <dt className="font-semibold text-app-muted">{label}</dt>
      <dd className="text-right font-medium text-app-text">{value}</dd>
    </div>
  );
}
