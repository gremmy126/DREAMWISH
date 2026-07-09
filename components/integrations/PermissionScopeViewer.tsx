"use client";

import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { ConnectorPermission } from "@/src/lib/integrations/types";

export function PermissionScopeViewer({
  permissions
}: {
  permissions: ConnectorPermission[];
}) {
  const { language } = useAppLanguage();
  const title =
    language === "ko"
      ? "OAuth Scope / 권한"
      : language === "ja"
        ? "OAuth Scope / 権限"
        : "OAuth Scope / Permissions";

  return (
    <div className="rounded-app border border-app-border bg-app-bg p-3">
      <p className="mb-2 text-xs font-semibold text-app-text">{title}</p>
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
