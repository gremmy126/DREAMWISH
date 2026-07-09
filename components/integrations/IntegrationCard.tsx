"use client";

import type { LucideIcon } from "lucide-react";
import type { Integration } from "@/src/lib/integrations/types";
import { IntegrationStatusBadge } from "./IntegrationStatusBadge";

export function IntegrationCard({
  integration,
  icon: Icon,
  active,
  onSelect
}: {
  integration: Integration;
  icon: LucideIcon;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-app border p-4 text-left shadow-soft transition ${
        active
          ? "border-app-primary bg-app-hover"
          : "border-app-border bg-white hover:bg-app-hover"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-app-primary shadow-soft">
          <Icon size={18} />
        </div>
        <IntegrationStatusBadge status={integration.status} />
      </div>
      <p className="text-sm font-semibold text-app-text">{integration.serviceName}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-app-muted">
        {integration.description}
      </p>
      <div className="mt-3 flex items-center justify-between text-[11px] text-app-muted">
        <span>{integration.connectedAccount || "계정 없음"}</span>
        <span>{integration.syncEnabled ? "sync on" : "sync off"}</span>
      </div>
    </button>
  );
}
