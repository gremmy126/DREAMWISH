"use client";

import { HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

type StorageStatusProps = {
  compact?: boolean;
};

type StorageInfo = {
  localStorageBytes: number;
  usageBytes: number | null;
  quotaBytes: number | null;
};

export function StorageStatus({ compact = false }: StorageStatusProps) {
  const [info, setInfo] = useState<StorageInfo>({
    localStorageBytes: 0,
    usageBytes: null,
    quotaBytes: null
  });
  const { t } = useAppLanguage();

  useEffect(() => {
    let active = true;

    async function load() {
      const localStorageBytes = measureLocalStorage();
      const estimate =
        "storage" in navigator && navigator.storage?.estimate
          ? await navigator.storage.estimate()
          : null;

      if (!active) return;

      setInfo({
        localStorageBytes,
        usageBytes: estimate?.usage ?? null,
        quotaBytes: estimate?.quota ?? null
      });
    }

    void load();
    window.addEventListener("storage", load);

    return () => {
      active = false;
      window.removeEventListener("storage", load);
    };
  }, []);

  const usage = info.usageBytes ?? info.localStorageBytes;
  const quota = info.quotaBytes;
  const percent = quota ? Math.min(100, Math.round((usage / quota) * 100)) : null;

  return (
    <div className={compact ? "" : "rounded-app border border-app-border bg-white p-4"}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardDrive size={compact ? 14 : 16} className="text-app-primary" />
          <p className="text-xs font-semibold text-app-text">{t("storage.title")}</p>
        </div>
        {percent !== null ? (
          <span className="text-xs font-semibold text-app-primary">{percent}%</span>
        ) : null}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-app-primary transition-all"
          style={{ width: `${percent ?? 0}%` }}
        />
      </div>

      <div className="mt-3 space-y-1 text-xs text-app-muted">
        <div className="flex items-center justify-between gap-2">
          <span>{t("storage.used")}</span>
          <span className="font-medium text-app-text">{formatBytes(usage)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>{t("storage.browser")}</span>
          <span className="font-medium text-app-text">
            {formatBytes(info.localStorageBytes)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>{t("storage.limit")}</span>
          <span className="font-medium text-app-text">
            {quota ? formatBytes(quota) : t("storage.unknown")}
          </span>
        </div>
      </div>
    </div>
  );
}

function measureLocalStorage() {
  let total = 0;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;

    const value = window.localStorage.getItem(key) || "";
    total += byteLength(key) + byteLength(value);
  }

  return total;
}

function byteLength(value: string) {
  return new Blob([value]).size;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
