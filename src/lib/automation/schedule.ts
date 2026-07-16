import { isValidTimezone } from "../settings/app-preferences";

export type ScenarioScheduleKind = "daily" | "weekly" | "weekdays" | "interval" | "once";

export type ScenarioSchedule = {
  kind: ScenarioScheduleKind;
  /** "HH:MM" local time in `timezone` (daily/weekly/weekdays). */
  time: string;
  /** 0(일요일)–6(토요일), weekly only. */
  weekday: number;
  /** Minutes between runs, interval only. */
  intervalMinutes: number;
  /** ISO instant, once only. */
  onceAt: string | null;
  /** IANA timezone; empty means server/system timezone. */
  timezone: string;
};

const DEFAULT_SCHEDULE: ScenarioSchedule = {
  kind: "daily",
  time: "09:00",
  weekday: 1,
  intervalMinutes: 60,
  onceAt: null,
  timezone: ""
};

/** Reads the structured schedule out of a schedule node's config map. */
export function parseScheduleConfig(
  config: Record<string, string | number | boolean> | undefined
): ScenarioSchedule | null {
  if (!config) return null;
  const kind = String(config.scheduleKind || "");
  if (!["daily", "weekly", "weekdays", "interval", "once"].includes(kind)) return null;
  const time = /^\d{2}:\d{2}$/u.test(String(config.scheduleTime))
    ? String(config.scheduleTime)
    : DEFAULT_SCHEDULE.time;
  const weekday = clampInt(Number(config.scheduleWeekday), 0, 6, DEFAULT_SCHEDULE.weekday);
  const intervalMinutes = clampInt(
    Number(config.scheduleIntervalMinutes),
    1,
    7 * 24 * 60,
    DEFAULT_SCHEDULE.intervalMinutes
  );
  const onceAt =
    typeof config.scheduleOnceAt === "string" && !Number.isNaN(new Date(config.scheduleOnceAt).getTime())
      ? new Date(config.scheduleOnceAt).toISOString()
      : null;
  const timezoneRaw = String(config.scheduleTimezone || "");
  const timezone = timezoneRaw && isValidTimezone(timezoneRaw) ? timezoneRaw : "";
  return { kind: kind as ScenarioScheduleKind, time, weekday, intervalMinutes, onceAt, timezone };
}

/**
 * Computes the next execution instant (ISO 8601 UTC) for a schedule after
 * `from`, respecting the schedule's IANA timezone. Returns null when the
 * schedule has no future run (e.g. a past one-time schedule).
 */
export function computeNextRunAt(schedule: ScenarioSchedule, from: Date = new Date()): string | null {
  const timezone = schedule.timezone || systemTimezone();

  if (schedule.kind === "once") {
    if (!schedule.onceAt) return null;
    const at = new Date(schedule.onceAt);
    return at.getTime() > from.getTime() ? at.toISOString() : null;
  }

  if (schedule.kind === "interval") {
    return new Date(from.getTime() + schedule.intervalMinutes * 60_000).toISOString();
  }

  const [hour, minute] = schedule.time.split(":").map((part) => parseInt(part, 10));
  for (let dayOffset = 0; dayOffset <= 8; dayOffset += 1) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000);
    const parts = zonedParts(probe, timezone);
    const candidate = utcFromZoned(parts.year, parts.month, parts.day, hour, minute, timezone);
    if (candidate.getTime() <= from.getTime()) continue;
    const candidateWeekday = zonedWeekday(candidate, timezone);
    if (schedule.kind === "weekly" && candidateWeekday !== schedule.weekday) continue;
    if (schedule.kind === "weekdays" && (candidateWeekday === 0 || candidateWeekday === 6)) continue;
    return candidate.toISOString();
  }
  return null;
}

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour: parseInt(parts.hour, 10) % 24,
    minute: parseInt(parts.minute, 10)
  };
}

/** Converts wall-clock time in a timezone to the matching UTC instant. */
function utcFromZoned(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = zonedParts(new Date(guess), timezone);
    const rendered = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const diff = target - rendered;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

function zonedWeekday(date: Date, timezone: string): number {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}
