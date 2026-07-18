import assert from "node:assert/strict";
import fs from "node:fs";

test("execution history renders server-owned diagnoses and actionable recovery metadata", () => {
  const card = fs.readFileSync("components/Automation/ExecutionDiagnosisCard.tsx", "utf8");
  const history = fs.readFileSync("components/Automation/DurableRunHistory.tsx", "utf8");
  for (const label of ["오류 코드", "실패 Step", "안전한 원인", "해결 방법", "재시도", "API 요청 ID", "Rate Limit", "Adapter 지연"]) {
    assert.match(card, new RegExp(label, "u"));
  }
  assert.match(card, /open_connection/u);
  assert.match(card, /open_admin_health/u);
  assert.match(history, /ExecutionDiagnosisCard/u);
  assert.match(history, /queuePosition/u);
  assert.match(history, /nextRunAt/u);
});
