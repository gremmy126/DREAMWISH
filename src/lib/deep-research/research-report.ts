import type { ResearchReportSections } from "./deep-research.types";

const SECTION_PATTERNS: Array<{ key: keyof ResearchReportSections; pattern: RegExp }> = [
  { key: "summary", pattern: /핵심 요약|요약|summary/iu },
  { key: "findings", pattern: /확인된 사실|주요 발견|발견|상세 분석|findings/iu },
  { key: "conclusion", pattern: /결론|conclusion/iu },
  { key: "followUp", pattern: /추가 확인|한계|불확실|권장 다음 행동|follow/iu }
];

/**
 * Deterministically splits the generated Markdown report into display
 * sections by heading. Missing sections stay empty — never invented.
 */
export function parseResearchReportSections(markdown: string): ResearchReportSections {
  const sections: ResearchReportSections = {
    summary: "",
    findings: "",
    conclusion: "",
    followUp: ""
  };
  const blocks = markdown.split(/^#{2,3}\s+/mu).slice(1);
  for (const block of blocks) {
    const newlineIndex = block.indexOf("\n");
    const heading = newlineIndex >= 0 ? block.slice(0, newlineIndex).trim() : block.trim();
    const body = newlineIndex >= 0 ? block.slice(newlineIndex + 1).trim() : "";
    if (!body) continue;
    for (const { key, pattern } of SECTION_PATTERNS) {
      if (pattern.test(heading) && !sections[key]) {
        sections[key] = body.slice(0, 4000);
        break;
      }
    }
  }
  if (!sections.summary) {
    sections.summary = markdown.replace(/^#.*$/gmu, "").trim().slice(0, 600);
  }
  return sections;
}
