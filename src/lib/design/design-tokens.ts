// DreamWish design tokens as data. app/globals.css is the runtime source of
// truth for the UI; this module mirrors it for the Design Engine prompts, the
// design-system settings screen, and tests. Keep in sync with DESIGN.md §2–§7.

export type DesignTokenGroup = "color" | "radius" | "shadow" | "motion";

export type DesignToken = {
  name: string;
  cssVariable: string;
  light: string;
  dark: string;
  group: DesignTokenGroup;
  role: string;
};

export const DESIGN_TOKENS: DesignToken[] = [
  { name: "primary", cssVariable: "--primary", light: "#6d5df6", dark: "#8b7cff", group: "color", role: "Refined violet — CTA, active states, links" },
  { name: "primary-strong", cssVariable: "--primary-strong", light: "#5a49e8", dark: "#a094ff", group: "color", role: "Hover/pressed emphasis" },
  { name: "primary-soft", cssVariable: "--primary-soft", light: "#eeecfe", dark: "#2a2653", group: "color", role: "Tinted chips, selected backgrounds" },
  { name: "secondary", cssVariable: "--secondary", light: "#3b74e0", dark: "#6ea1ff", group: "color", role: "Restrained blue — informational accents" },
  { name: "background", cssVariable: "--background", light: "#f8fafc", dark: "#101418", group: "color", role: "App canvas" },
  { name: "card", cssVariable: "--card", light: "#ffffff", dark: "#171d23", group: "color", role: "Surfaces" },
  { name: "border", cssVariable: "--border", light: "#e8eaf2", dark: "#2c3440", group: "color", role: "Hairline borders" },
  { name: "text", cssVariable: "--text", light: "#111827", dark: "#eef2f7", group: "color", role: "Body text" },
  { name: "muted", cssVariable: "--muted", light: "#667085", dark: "#a7b0bd", group: "color", role: "Secondary text" },
  { name: "success", cssVariable: "--success", light: "#15803d", dark: "#4ade80", group: "color", role: "Positive state" },
  { name: "warning", cssVariable: "--warning", light: "#b45309", dark: "#fbbf24", group: "color", role: "Caution state" },
  { name: "danger", cssVariable: "--danger", light: "#dc2626", dark: "#f87171", group: "color", role: "Destructive state" },
  { name: "info", cssVariable: "--info", light: "#0369a1", dark: "#38bdf8", group: "color", role: "Neutral information" },
  { name: "radius-sm", cssVariable: "--radius-sm", light: "8px", dark: "8px", group: "radius", role: "Chips, small controls" },
  { name: "radius-md", cssVariable: "--radius-md", light: "12px", dark: "12px", group: "radius", role: "Buttons, inputs" },
  { name: "radius-lg", cssVariable: "--radius-lg", light: "16px", dark: "16px", group: "radius", role: "Small cards, dropdowns" },
  { name: "radius-xl", cssVariable: "--radius-xl", light: "18px", dark: "18px", group: "radius", role: "Cards, dialogs, drawers" },
  { name: "shadow-soft", cssVariable: "--shadow-soft", light: "0 8px 24px rgba(15, 23, 42, 0.04)", dark: "0 8px 24px rgba(0, 0, 0, 0.35)", group: "shadow", role: "Resting cards" },
  { name: "shadow-app", cssVariable: "--shadow-app", light: "0 18px 45px rgba(15, 23, 42, 0.06)", dark: "0 18px 45px rgba(0, 0, 0, 0.45)", group: "shadow", role: "Elevated cards, popovers" },
  { name: "motion-fast", cssVariable: "--motion-fast", light: "150ms", dark: "150ms", group: "motion", role: "Hover, small state changes" },
  { name: "motion-base", cssVariable: "--motion-base", light: "200ms", dark: "200ms", group: "motion", role: "Panels, dropdowns" },
  { name: "motion-slow", cssVariable: "--motion-slow", light: "250ms", dark: "250ms", group: "motion", role: "Dialogs, page transitions" }
];

export function getTokensByGroup(group: DesignTokenGroup): DesignToken[] {
  return DESIGN_TOKENS.filter((token) => token.group === group);
}

/** Compact token block injected into Design Engine prompts. */
export function renderTokensForPrompt(): string {
  const colors = getTokensByGroup("color")
    .map((token) => `${token.name}: ${token.light} (dark: ${token.dark}) — ${token.role}`)
    .join("\n");
  return (
    "DreamWish design tokens (light mode first):\n" +
    `${colors}\n` +
    "Radius: 8px chips · 12px buttons/inputs · 16px dropdowns · 18px cards/dialogs.\n" +
    "Spacing: 4px base scale (4/8/12/16/20/24/32/40/48/64/96).\n" +
    "Motion: 150–250ms, cubic-bezier(0.2, 0, 0, 1), honor prefers-reduced-motion.\n" +
    "Typography: Inter + Noto Sans KR system stack, tabular numerals for data."
  );
}
