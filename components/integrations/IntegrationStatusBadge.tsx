import type { IntegrationStatus } from "@/src/lib/integrations/types";

const statusMeta: Record<IntegrationStatus, { label: string; className: string }> = {
  not_connected: { label: "Not connected", className: "border-slate-200 bg-slate-50 text-slate-600" },
  connected: { label: "Connected", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  needs_permission: { label: "Needs permission", className: "border-amber-200 bg-amber-50 text-amber-700" },
  sync_error: { label: "Sync error", className: "border-red-200 bg-red-50 text-red-700" },
  disabled: { label: "Disabled", className: "border-slate-200 bg-slate-100 text-slate-500" },
  mock_mode: { label: "Mock mode", className: "border-indigo-200 bg-indigo-50 text-indigo-700" }
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const meta = statusMeta[status];
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}
