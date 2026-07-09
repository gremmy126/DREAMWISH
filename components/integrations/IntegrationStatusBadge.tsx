"use client";

import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import type { IntegrationStatus } from "@/src/lib/integrations/types";

const statusClass: Record<IntegrationStatus, string> = {
  not_connected: "border-slate-200 bg-slate-50 text-slate-600",
  connected: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_permission: "border-amber-200 bg-amber-50 text-amber-700",
  sync_error: "border-red-200 bg-red-50 text-red-700",
  disabled: "border-slate-200 bg-slate-100 text-slate-500",
  mock_mode: "border-indigo-200 bg-indigo-50 text-indigo-700"
};

export function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
  const { language } = useAppLanguage();
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClass[status]}`}>
      {statusLabel(status, language)}
    </span>
  );
}

function statusLabel(status: IntegrationStatus, language: string) {
  const labels: Record<string, Record<IntegrationStatus, string>> = {
    ko: {
      not_connected: "미연결",
      connected: "연결됨",
      needs_permission: "권한 필요",
      sync_error: "동기화 오류",
      disabled: "비활성",
      mock_mode: "Mock 모드"
    },
    en: {
      not_connected: "Not connected",
      connected: "Connected",
      needs_permission: "Needs permission",
      sync_error: "Sync error",
      disabled: "Disabled",
      mock_mode: "Mock mode"
    },
    ja: {
      not_connected: "未接続",
      connected: "接続済み",
      needs_permission: "権限必要",
      sync_error: "同期エラー",
      disabled: "無効",
      mock_mode: "Mockモード"
    }
  };
  return (labels[language] || labels.ko)[status];
}
