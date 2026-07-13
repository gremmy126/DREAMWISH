"use client";

import { HardDrive, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { calculateStoragePercent } from "@/src/lib/storage/storage-metrics";

type StorageStatusProps = {
  compact?: boolean;
};

type StorageInfo = {
  usageBytes: number;
  quotaBytes: number | null;
  measuredAt: string;
};

export function StorageStatus({ compact = false }: StorageStatusProps) {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const { t } = useAppLanguage();

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/storage/usage", { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as
        | (StorageInfo & { error?: string })
        | null;
      if (!response.ok || !result) throw new Error(result?.error || "storage_failed");
      setInfo(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handleRefresh = () => void load();
    window.addEventListener("focus", handleRefresh);
    window.addEventListener("dreamwish:storage-updated", handleRefresh);
    return () => {
      window.removeEventListener("focus", handleRefresh);
      window.removeEventListener("dreamwish:storage-updated", handleRefresh);
    };
  }, [load]);

  const usage = info?.usageBytes ?? 0;
  const quota = info?.quotaBytes ?? null;
  const percent = calculateStoragePercent(usage, quota);

  return (
    <div className={compact ? "" : "rounded-app border border-app-border bg-white p-4"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive size={compact ? 14 : 16} className="text-app-primary" />
          <p className="text-xs font-semibold text-app-text">{t("storage.title")}</p>
        </div>
        {percent !== null && !loading ? (
          <span className="text-xs font-semibold text-app-primary">{percent.label}</span>
        ) : null}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-app-primary transition-all"
          style={{ width: `${percent?.widthPercent ?? 0}%` }}
        />
      </div>

      <div className="mt-3 space-y-1 text-xs text-app-muted">
        <div className="flex items-center justify-between gap-2">
          <span>{t("storage.used")}</span>
          <span className="font-medium text-app-text">{formatBytes(usage)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>{t("storage.limit")}</span>
          <span className="font-medium text-app-text">
            {quota ? formatBytes(quota) : t("storage.unknown")}
          </span>
        </div>
        {info?.measuredAt ? (
          <div className="flex items-center justify-between gap-2">
            <span>{t("storage.measuredAt")}</span>
            <span className="font-medium text-app-text">
              {new Date(info.measuredAt).toLocaleTimeString()}
            </span>
          </div>
        ) : null}
        {error ? (
          <button
            type="button"
            onClick={() => void load()}
            className="mt-2 inline-flex items-center gap-1 font-semibold text-red-600"
          >
            <RefreshCw size={11} />
            {t("storage.retry")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
