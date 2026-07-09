import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ConnectorPermission } from "@/src/lib/integrations/types";

export function ConnectorPermissionList({
  permissions
}: {
  permissions: ConnectorPermission[];
}) {
  return (
    <div className="space-y-2">
      {permissions.map((permission) => (
        <div
          key={permission.permissionKey}
          className="flex items-start justify-between gap-3 rounded-2xl border border-app-border bg-white px-3 py-3"
        >
          <div className="min-w-0">
            <p className="text-xs font-semibold text-app-text">
              {permission.permissionName}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-app-muted">
              {permission.description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-app-border bg-app-bg px-2 py-1 text-[10px] font-semibold uppercase text-app-muted">
              {permission.riskLevel}
            </span>
            {permission.isGranted ? (
              <CheckCircle2 size={15} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={15} className="text-amber-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
