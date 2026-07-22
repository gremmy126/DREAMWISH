import assert from "node:assert/strict";
import {
  parseResearchReportSections,
  stripMarkdownEmphasis
} from "../src/lib/deep-research/research-report";
import { buildDeterministicConclusion, clampText } from "../src/lib/decisions/decision-conclusion";
import type { Decision } from "../src/lib/decisions/decision.types";

test("markdown emphasis is stripped while line structure is preserved", () => {
  const input = "**시장 전망**은 밝다.\n- __성장률__ 12% [1]\n### 소제목\n`코드` 아님 *강조* 끝";
  const output = stripMarkdownEmphasis(input);
  assert.ok(!output.includes("**"), output);
  assert.ok(!output.includes("__"), output);
  assert.ok(!output.includes("`"), output);
  assert.ok(!output.includes("###"), output);
  assert.match(output, /시장 전망은 밝다\./u);
  assert.match(output, /성장률 12% \[1\]/u); // 출처 번호는 보존
  assert.equal(output.split("\n").length, 4); // 줄 구조 보존
});

test("research report sections come out as plain text without bold markers", () => {
  const sections = parseResearchReportSections(
    "## 핵심 요약\n**A 시장**은 확대 중입니다.\n\n## 확인된 사실과 근거\n- **매출** 성장 [1]\n- 경쟁 심화 [2]\n"
  );
  assert.equal(sections.summary, "A 시장은 확대 중입니다.");
  assert.ok(!sections.findings.includes("**"), sections.findings);
  assert.match(sections.findings, /매출 성장 \[1\]/u);
});

test("the deterministic conclusion always includes a switch condition and first action", () => {
  const decision = {
    id: "d1",
    title: "신규 시장 진출",
    problem: { statement: "진출할까 강화할까" },
    criteria: [{ id: "c1" }, { id: "c2" }],
    simulationResult: {
      ranking: [
        { title: "A안", total: 82 },
        { title: "B안", total: 74 }
      ],
      gap: 8
    },
    research: null,
    employeeSignalWeight: 0.15
  } as unknown as Decision;

  const conclusion = buildDeterministicConclusion(decision, null);
  assert.ok(conclusion.switchCondition.length > 10);
  assert.ok(conclusion.firstAction.length > 10);
  // 사람다운 조건부 권고: 영구 선택이 아니라 검증을 권한다.
  assert.match(conclusion.coreConclusion, /검증/u);
  assert.ok(!/%\s*확신|점수는\s*\d+점입니다/u.test(conclusion.coreConclusion));
});

test("clampText never cuts a Korean word in half and marks truncation", () => {
  const text =
    "인플루언서와 협력하여 콘텐츠를 공유하고, 브랜드 인지도를 높입니다. " +
    "이후 후속 캠페인으로 확장할 수 있습니다.";
  const clamped = clampText(text, 30);
  assert.ok(clamped.length <= 32, clamped);
  // The raw slice would have ended on "브랜"; a boundary clamp must not.
  assert.ok(!clamped.endsWith("브랜"), clamped);
  assert.ok(clamped.endsWith("…"), clamped);
  // Whatever survives must be whole words separated by the original spaces.
  const body = clamped.replace(/\s*…$/u, "");
  assert.ok(text.replace(/\s+/gu, " ").startsWith(body.trim()), clamped);
});

test("clampText returns short text unchanged without an ellipsis", () => {
  assert.equal(clampText("짧은 문장입니다.", 100), "짧은 문장입니다.");
});

test("the deterministic conclusion embeds the research summary without a mid-word cut", () => {
  const decision = {
    id: "d2",
    title: "마케팅을 어떻게 해야 할까",
    problem: { statement: "광고할 돈은 없고 어떻게 홍보하지" },
    criteria: [{ id: "c1" }],
    simulationResult: { ranking: [{ title: "단계적·제한 추진", total: 80 }], gap: 6 },
    research: {
      summary:
        "광고를 할 돈이 없다면, 홍보를 위한 비용이 없는 방법을 찾아야 합니다. " +
        "블로그, 소셜 미디어, 인플루언서 마케팅 등 다양한 방법을 고려할 수 있습니다. " +
        "인플루언서와 협력하여 콘텐츠를 공유하고, 브랜드 인지도를 높이는 전략도 있습니다."
    },
    employeeSignalWeight: 0.15
  } as unknown as Decision;

  const conclusion = buildDeterministicConclusion(decision, null);
  assert.ok(!conclusion.rationale.endsWith("브랜"), conclusion.rationale);
  assert.ok(/리서치 요약:/u.test(conclusion.rationale));
});
