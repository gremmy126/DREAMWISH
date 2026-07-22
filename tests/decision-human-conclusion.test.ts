import assert from "node:assert/strict";
import {
  parseResearchReportSections,
  stripMarkdownEmphasis
} from "../src/lib/deep-research/research-report";
import { buildDeterministicConclusion } from "../src/lib/decisions/decision-conclusion";
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
