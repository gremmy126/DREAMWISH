import assert from "node:assert/strict";
import * as researchReport from "../src/lib/deep-research/research-report";

type DisplayBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const reportModule = researchReport as typeof researchReport & {
  parseResearchDisplayBlocks?: (markdown: string) => DisplayBlock[];
};

test("research report display removes markdown markers and preserves structure", () => {
  assert.equal(typeof reportModule.parseResearchDisplayBlocks, "function");

  const blocks = reportModule.parseResearchDisplayBlocks!(
    "### 시장 현황\n**성장세**가 확인됐습니다.[1]\n\n* 첫 번째 근거\n- 두 번째 `근거`\n\n1. 후속 확인"
  );

  assert.deepEqual(blocks, [
    { type: "heading", text: "시장 현황" },
    { type: "paragraph", text: "성장세가 확인됐습니다.[1]" },
    { type: "list", ordered: false, items: ["첫 번째 근거", "두 번째 근거"] },
    { type: "list", ordered: true, items: ["후속 확인"] }
  ]);
  assert.doesNotMatch(JSON.stringify(blocks), /[#*`]/u);
});

test("research report display keeps link labels without markdown URLs", () => {
  assert.equal(typeof reportModule.parseResearchDisplayBlocks, "function");

  const blocks = reportModule.parseResearchDisplayBlocks!(
    "[공식 자료](https://example.com/report)를 확인했습니다."
  );

  assert.deepEqual(blocks, [
    { type: "paragraph", text: "공식 자료를 확인했습니다." }
  ]);
});
