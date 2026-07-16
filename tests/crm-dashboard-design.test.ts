import assert from "node:assert/strict";
import fs from "node:fs";

test("CRM matches the approved dashboard structure without a company tab", () => {
  const source = fs.readFileSync("components/CRM/CRMView.tsx", "utf8");
  const pipeline = fs.readFileSync("components/CRM/CrmPipelineBoard.tsx", "utf8");
  for (const tab of ["대시보드", "연락처", "딜 (거래)", "활동", "이메일", "보고서"]) {
    assert.match(source, new RegExp(tab.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  // The settings tab was removed: CRM exposes exactly six working tabs and
  // the active tab persists across refresh via localStorage.
  assert.doesNotMatch(source, /"설정"/u);
  assert.match(source, /TAB_STORAGE_KEY/u);
  assert.doesNotMatch(source, /id:\s*"companies"|label:\s*"회사"/u);
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/u);
  assert.match(source, /활동 요약/u);
  assert.match(source, /AI 추천 후속 조치/u);
  for (const stage of ["신규", "접촉됨", "제안", "협상", "성사"]) {
    assert.match(pipeline, new RegExp(stage, "u"));
  }
});
