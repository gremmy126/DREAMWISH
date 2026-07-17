"use client";

import {
  Braces,
  CalendarClock,
  Code2,
  Database,
  Filter,
  GitBranch,
  Repeat2,
  Route,
  Timer,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { getAutomationApp } from "@/src/lib/automation/app-registry";

export type AppLogoProps = {
  appId: string;
  size?: number;
  color?: string;
  className?: string;
  fallbackIcon?: LucideIcon;
};

/** A failed local path remains on its fallback for the rest of the page session. */
const failedLogoPaths = new Set<string>();

export function AppLogo({ appId, size = 32, color = "#6d5dfc", className = "", fallbackIcon }: AppLogoProps) {
  const app = getAutomationApp(appId);
  const source = app?.logoPath || null;
  const [failed, setFailed] = useState(() => Boolean(source && failedLogoPaths.has(source)));

  useEffect(() => {
    setFailed(Boolean(source && failedLogoPaths.has(source)));
  }, [source]);

  if (app && source && !failed) {
    return (
      <img
        src={app.logoPath}
        alt={`${app.label} 로고`}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => {
          failedLogoPaths.add(source);
          setFailed(true);
        }}
        className={`shrink-0 rounded-[28%] object-contain ${className}`.trim()}
      />
    );
  }

  const Icon = fallbackIcon || internalIcon(appId);
  return (
    <span
      role="img"
      aria-label={`${app?.label || appId} 아이콘`}
      className={`flex shrink-0 items-center justify-center rounded-[28%] text-white shadow-sm ${className}`.trim()}
      style={{ width: size, height: size, backgroundColor: color }}
    >
      <Icon size={Math.max(14, Math.round(size * 0.48))} aria-hidden />
    </span>
  );
}

function internalIcon(appId: string): LucideIcon {
  if (appId === "schedule" || appId === "datetime") return CalendarClock;
  if (appId === "router") return Route;
  if (appId === "filter") return Filter;
  if (appId === "code") return Code2;
  if (appId === "delay") return Timer;
  if (appId === "iterator" || appId.includes("aggregator")) return Repeat2;
  if (appId === "json" || appId === "csv" || appId === "text-formatter") return Braces;
  if (appId === "data-store") return Database;
  if (appId === "error-handler") return GitBranch;
  return Wrench;
}
