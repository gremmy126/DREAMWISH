import type { ResearchReportSections } from "./deep-research.types";

export type ResearchDisplayBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const SECTION_PATTERNS: Array<{ key: keyof ResearchReportSections; pattern: RegExp }> = [
  { key: "summary", pattern: /핵심 요약|요약|summary/iu },
  { key: "findings", pattern: /확인된 사실|주요 발견|발견|상세 분석|findings/iu },
  { key: "conclusion", pattern: /결론|conclusion/iu },
  { key: "followUp", pattern: /추가 확인|한계|불확실|권장 다음 행동|follow/iu }
];

/**
 * 여러 줄 텍스트에서 마크다운 강조(**굵게**, `코드`, ### 제목 기호 등)만
 * 걷어내고 줄 구조는 보존한다. 사용자에게 보이는 본문에 별표가 그대로
 * 노출되지 않게 하는 최종 방어선이다.
 */
export function stripMarkdownEmphasis(value: string): string {
  return value
    .split("\n")
    .map((line) =>
      line
        .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
        .replace(/\*\*([^*\n]+)\*\*/gu, "$1")
        .replace(/__([^_\n]+)__/gu, "$1")
        .replace(/~~([^~\n]+)~~/gu, "$1")
        .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$|[.,!?)])/gu, "$1$2")
        .replace(/`([^`\n]+)`/gu, "$1")
        .replace(/^\s*#{1,6}\s+/u, "")
        .replace(/\*\*/gu, "")
        .replace(/\s{2,}/gu, " ")
        .trimEnd()
    )
    .join("\n")
    .trim();
}

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
        sections[key] = stripMarkdownEmphasis(body).slice(0, 4000);
        break;
      }
    }
  }
  if (!sections.summary) {
    sections.summary = stripMarkdownEmphasis(
      markdown.replace(/^#.*$/gmu, "").trim()
    ).slice(0, 600);
  }
  return sections;
}

export function parseResearchDisplayBlocks(markdown: string): ResearchDisplayBlock[] {
  const blocks: ResearchDisplayBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<ResearchDisplayBlock, { type: "list" }> | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  for (const rawLine of markdown.replace(/\r/gu, "").split("\n")) {
    const line = rawLine.trim();
    if (!line || /^```/u.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: cleanResearchDisplayText(heading[1]) });
      continue;
    }

    const unorderedItem = line.match(/^[-*+]\s+(.+)$/u);
    const orderedItem = line.match(/^\d+[.)]\s+(.+)$/u);
    if (unorderedItem || orderedItem) {
      flushParagraph();
      const ordered = Boolean(orderedItem);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { type: "list", ordered, items: [] };
      list.items.push(cleanResearchDisplayText((orderedItem || unorderedItem)![1]));
      continue;
    }

    flushList();
    paragraph.push(cleanResearchDisplayText(line.replace(/^>\s?/u, "")));
  }

  flushParagraph();
  flushList();
  return blocks.filter((block) =>
    block.type === "list" ? block.items.some(Boolean) : Boolean(block.text)
  );
}

function cleanResearchDisplayText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, "$1")
    .replace(/\*\*([^*\n]+)\*\*/gu, "$1")
    .replace(/__([^_\n]+)__/gu, "$1")
    .replace(/~~([^~\n]+)~~/gu, "$1")
    .replace(/\*([^*\n]+)\*/gu, "$1")
    .replace(/`([^`\n]+)`/gu, "$1")
    .replace(/[*`]/gu, "")
    .replace(/(^|\s)#{1,6}\s*/gu, "$1")
    .replace(/\s{2,}/gu, " ")
    .trim();
}
