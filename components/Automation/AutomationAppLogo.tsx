"use client";

import { Braces, CalendarClock, Code2, Database, Filter, GitBranch, Repeat2, Route, Timer, Wrench } from "lucide-react";
import { getAutomationApp } from "@/src/lib/automation/app-registry";

export function AutomationAppLogo({ appId, size = 32, color = "#6d5dfc" }: { appId: string; size?: number; color?: string }) {
  const app = getAutomationApp(appId);
  if (app) return <img src={app.logoPath} alt={`${app.label} 로고`} width={size} height={size} className="shrink-0 rounded-[28%] object-contain" />;
  const Icon = internalIcon(appId);
  return <span className="flex shrink-0 items-center justify-center rounded-[28%] text-white shadow-sm" style={{ width: size, height: size, backgroundColor: color }}><Icon size={Math.max(14, Math.round(size * 0.48))} /></span>;
}

function internalIcon(appId: string) {
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
