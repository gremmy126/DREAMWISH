import type { ResearchMode, ResearchSettings } from "./deep-research.types";

export const RESEARCH_LIMITS = {
  minDurationMs: 60_000,
  maxDurationMs: 60 * 60_000,
  maxSearchQueries: 40,
  maxPages: 60,
  maxSources: 40,
  maxConcurrency: 4,
  maxQueryLength: 2_000
} as const;

const MODE_PRESETS: Record<Exclude<ResearchMode, "custom">, Partial<ResearchSettings>> = {
  standard: {
    maxDurationMs: 3 * 60_000,
    maxSearchQueries: 6,
    maxPages: 8,
    minSources: 3,
    maxSources: 10,
    concurrency: 2
  },
  deep: {
    maxDurationMs: 10 * 60_000,
    maxSearchQueries: 14,
    maxPages: 20,
    minSources: 5,
    maxSources: 20,
    concurrency: 3
  },
  deepest: {
    maxDurationMs: 30 * 60_000,
    maxSearchQueries: 24,
    maxPages: 40,
    minSources: 8,
    maxSources: 30,
    concurrency: 4
  }
};

const DEFAULTS: ResearchSettings = {
  mode: "standard",
  maxDurationMs: 3 * 60_000,
  maxSearchQueries: 6,
  maxPages: 8,
  minSources: 3,
  maxSources: 10,
  concurrency: 2,
  includeCrm: false,
  includeErp: false,
  includeLocalDocs: false,
  preferOfficial: true,
  preferRecent: true,
  includeNews: true,
  includeGithub: false,
  resultLanguage: "ko",
  reportLength: "medium",
  autoSave: false
};

/**
 * Normalizes user-supplied research settings: mode presets fill the budget
 * fields, every numeric budget is clamped, and the time budget is an upper
 * bound only — the runner finishes early once evidence suffices.
 */
export function resolveResearchSettings(input: Partial<ResearchSettings> | undefined): ResearchSettings {
  const mode: ResearchMode =
    input?.mode === "deep" || input?.mode === "deepest" || input?.mode === "custom"
      ? input.mode
      : "standard";
  const preset = mode === "custom" ? {} : MODE_PRESETS[mode];
  const merged: ResearchSettings = {
    ...DEFAULTS,
    ...preset,
    ...sanitizeInput(input),
    mode
  };
  if (mode !== "custom") {
    merged.maxDurationMs = clampNumber(
      typeof input?.maxDurationMs === "number" ? input.maxDurationMs : preset.maxDurationMs!,
      RESEARCH_LIMITS.minDurationMs,
      RESEARCH_LIMITS.maxDurationMs
    );
  }
  merged.maxDurationMs = clampNumber(
    merged.maxDurationMs,
    RESEARCH_LIMITS.minDurationMs,
    RESEARCH_LIMITS.maxDurationMs
  );
  merged.maxSearchQueries = clampNumber(merged.maxSearchQueries, 1, RESEARCH_LIMITS.maxSearchQueries);
  merged.maxPages = clampNumber(merged.maxPages, 1, RESEARCH_LIMITS.maxPages);
  merged.maxSources = clampNumber(merged.maxSources, 1, RESEARCH_LIMITS.maxSources);
  merged.minSources = clampNumber(merged.minSources, 1, merged.maxSources);
  merged.concurrency = clampNumber(merged.concurrency, 1, RESEARCH_LIMITS.maxConcurrency);
  return merged;
}

function sanitizeInput(input: Partial<ResearchSettings> | undefined): Partial<ResearchSettings> {
  if (!input) return {};
  const output: Partial<ResearchSettings> = {};
  for (const key of [
    "maxDurationMs",
    "maxSearchQueries",
    "maxPages",
    "minSources",
    "maxSources",
    "concurrency"
  ] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) output[key] = Math.round(value);
  }
  for (const key of [
    "includeCrm",
    "includeErp",
    "includeLocalDocs",
    "preferOfficial",
    "preferRecent",
    "includeNews",
    "includeGithub",
    "autoSave"
  ] as const) {
    if (typeof input[key] === "boolean") output[key] = input[key];
  }
  if (input.resultLanguage === "ko" || input.resultLanguage === "en") {
    output.resultLanguage = input.resultLanguage;
  }
  if (
    input.reportLength === "short" ||
    input.reportLength === "medium" ||
    input.reportLength === "long"
  ) {
    output.reportLength = input.reportLength;
  }
  return output;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
