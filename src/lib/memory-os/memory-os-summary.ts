import { chatWithAI } from "../ai/ai.service";
import type { MemoryOsAiSummary, MemoryOsItem } from "./memory-os.types";

// AI Summary for a memory: 3줄 요약 · 핵심 결과 한 문장 · 주의할 점 · 다음
// 의사결정에 사용할 내용. AI 실패 시 결정론적 요약으로 대체되어 항상 완성된다.

export function buildDeterministicSummary(item: MemoryOsItem): MemoryOsAiSummary {
  const sentences = item.content
    .split(/(?<=[.!?다요])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 4);
  const threeLines = sentences.slice(0, 3);
  while (threeLines.length < 3 && item.insights[threeLines.length - sentences.length]) {
    threeLines.push(item.insights[threeLines.length - sentences.length]);
  }
  return {
    threeLines: threeLines.length ? threeLines : [item.description || item.title],
    coreOutcome: sentences[0]?.slice(0, 160) || item.title,
    cautions: item.insights.slice(0, 3),
    nextUse: [
      item.decisionId
        ? "연결된 결정의 후속 검토 시 이 기록을 근거로 사용하세요."
        : "비슷한 결정을 시작할 때 이 기록을 먼저 확인하세요."
    ],
    generatedAt: new Date().toISOString(),
    source: "deterministic"
  };
}

export async function summarizeMemory(item: MemoryOsItem): Promise<MemoryOsAiSummary> {
  const fallback = buildDeterministicSummary(item);
  try {
    const response = await chatWithAI([
      {
        role: "system",
        content:
          "당신은 조직 기억 분석가다. 입력된 기록만 근거로 반드시 JSON만 출력한다: " +
          '{"threeLines":[3줄 요약],"coreOutcome":"핵심 결과 한 문장","cautions":[주의할 점],' +
          '"nextUse":[다음 의사결정에 사용할 내용]} — 입력에 없는 사실을 만들지 마라.'
      },
      {
        role: "user",
        content: JSON.stringify({
          title: item.title,
          type: item.type,
          content: item.content.slice(0, 3000),
          insights: item.insights,
          project: item.project
        })
      }
    ]);
    const start = response.search(/\{/u);
    if (start < 0) return fallback;
    const parsed = JSON.parse(response.slice(start).replace(/```/gu, "")) as Partial<MemoryOsAiSummary>;
    if (!Array.isArray(parsed.threeLines) || !parsed.threeLines.length) return fallback;
    return {
      threeLines: parsed.threeLines.map((line) => String(line).slice(0, 200)).slice(0, 3),
      coreOutcome:
        typeof parsed.coreOutcome === "string" && parsed.coreOutcome.trim()
          ? parsed.coreOutcome.slice(0, 200)
          : fallback.coreOutcome,
      cautions: Array.isArray(parsed.cautions)
        ? parsed.cautions.map((entry) => String(entry).slice(0, 200)).slice(0, 4)
        : fallback.cautions,
      nextUse: Array.isArray(parsed.nextUse)
        ? parsed.nextUse.map((entry) => String(entry).slice(0, 200)).slice(0, 4)
        : fallback.nextUse,
      generatedAt: new Date().toISOString(),
      source: "ai"
    };
  } catch {
    return fallback;
  }
}
