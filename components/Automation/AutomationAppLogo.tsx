"use client";

import { Braces, CalendarClock, Code2, Database, Filter, GitBranch, Repeat2, Route, Timer, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { getAutomationApp } from "@/src/lib/automation/app-registry";

/**
 * App logo with a user-asset override chain: official assets dropped into
 * public/images (or public/images/app-logos) named "{appId}.svg|png" take
 * priority over the bundled automation icons; internal tool nodes fall back
 * to a lucide glyph. Never depends on an external URL.
 */
/** Remembers per app which candidate resolved, so 404 probing runs once per page session. */
const resolvedIndexCache = new Map<string, number>();

export function AutomationAppLogo({ appId, size = 32, color = "#6d5dfc" }: { appId: string; size?: number; color?: string }) {
  const app = getAutomationApp(appId);
  const candidates = app
    ? [
        `/images/app-logos/${app.id}.svg`,
        `/images/app-logos/${app.id}.png`,
        `/images/app-logos/${app.id}.jpg`,
        `/images/${app.id}.svg`,
        `/images/${app.id}.png`,
        `/images/${app.id}.jpg`,
        app.logoPath
      ]
    : [];
  const [sourceIndex, setSourceIndex] = useState(() => resolvedIndexCache.get(appId) ?? 0);

  useEffect(() => {
    setSourceIndex(resolvedIndexCache.get(appId) ?? 0);
  }, [appId]);

  if (app && sourceIndex < candidates.length) {
    return (
      <img
        src={candidates[sourceIndex]}
        alt={`${app.label} 로고`}
        width={size}
        height={size}
        onError={() => {
          const next = sourceIndex + 1;
          resolvedIndexCache.set(appId, next);
          setSourceIndex(next);
        }}
        onLoad={() => resolvedIndexCache.set(appId, sourceIndex)}
        className="shrink-0 rounded-[28%] object-contain"
      />
    );
  }

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
