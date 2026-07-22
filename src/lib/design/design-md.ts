import { readFileSync } from "node:fs";
import path from "node:path";
import { renderTokensForPrompt } from "./design-tokens";

// Loader/parser for design-system/DESIGN.md — the design contract every
// DreamWish page and every AI-generated artifact inherits. Concept follows the
// DESIGN.md contract of nexu-io/open-design (Apache-2.0); content is ours.

export type DesignMdSection = {
  /** e.g. "1. Brand" */
  heading: string;
  body: string;
};

export type DesignMdDocument = {
  title: string;
  sections: DesignMdSection[];
  raw: string;
};

const DESIGN_MD_RELATIVE_PATH = path.join("design-system", "DESIGN.md");

// Server bundles may relocate the file; fall back to an embedded core so the
// engine keeps working even when the markdown asset is missing.
const EMBEDDED_FALLBACK = `# DreamWish Design System

## 1. Brand
DreamWish — Better Decisions Powered by AI. Personality: intelligent, calm,
trustworthy, premium. Korean-first copy, no fake numbers.

## 2. Color
${"Primary #6d5df6 (violet), secondary #3b74e0 (blue), background #f8fafc, card #ffffff, text #111827, muted #667085. Success #15803d, warning #b45309, danger #dc2626, info #0369a1. Light mode first, dark mode supported. No heavy gradients, AA contrast for body text."}

## 7. Motion
150–250ms, purposeful only, honor prefers-reduced-motion.
`;

let cached: DesignMdDocument | null = null;

export function parseDesignMd(raw: string): DesignMdDocument {
  const lines = raw.split(/\r?\n/u);
  const titleLine = lines.find((line) => line.startsWith("# "));
  const sections: DesignMdSection[] = [];
  let current: DesignMdSection | null = null;

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/u);
    if (heading) {
      if (current) sections.push({ ...current, body: current.body.trim() });
      current = { heading: heading[1].trim(), body: "" };
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  if (current) sections.push({ ...current, body: current.body.trim() });

  return {
    title: titleLine ? titleLine.slice(2).trim() : "DreamWish Design System",
    sections,
    raw
  };
}

export function loadDesignMd(): DesignMdDocument {
  if (cached) return cached;
  let raw = EMBEDDED_FALLBACK;
  try {
    raw = readFileSync(path.join(process.cwd(), DESIGN_MD_RELATIVE_PATH), "utf8");
  } catch {
    // Keep the embedded fallback.
  }
  cached = parseDesignMd(raw);
  return cached;
}

export function findDesignMdSection(
  document: DesignMdDocument,
  keyword: string
): DesignMdSection | null {
  const lower = keyword.toLowerCase();
  return (
    document.sections.find((section) => section.heading.toLowerCase().includes(lower)) ?? null
  );
}

/**
 * Prompt context for the Design Engine: the parsed contract compressed to the
 * sections that matter for generation, plus the token table.
 */
export function renderDesignContextForPrompt(): string {
  const document = loadDesignMd();
  const wanted = ["brand", "color", "typography", "spacing", "radius", "shadow", "motion", "accessibility"];
  const parts = document.sections
    .filter((section) => wanted.some((keyword) => section.heading.toLowerCase().includes(keyword)))
    .map((section) => `## ${section.heading}\n${section.body.slice(0, 1200)}`);
  return (
    `${document.title} — the DreamWish design contract. Follow it unless the user asks for a different brand.\n\n` +
    `${renderTokensForPrompt()}\n\n${parts.join("\n\n")}`
  ).slice(0, 9000);
}
