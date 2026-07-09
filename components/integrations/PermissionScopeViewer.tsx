import type { ConnectorPermission } from "@/src/lib/integrations/types";

export function PermissionScopeViewer({
  permissions
}: {
  permissions: ConnectorPermission[];
}) {
  return (
    <div className="rounded-app border border-app-border bg-app-bg p-3">
      <p className="mb-2 text-xs font-semibold text-app-text">OAuth Scope / 권한</p>
      <div className="flex flex-wrap gap-2">
        {permissions.map((permission) => (
          <span
            key={permission.permissionKey}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              permission.isGranted
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {permission.permissionKey}
          </span>
        ))}
      </div>
    </div>
  );
}
