import assert from "node:assert/strict";
import { getConfidenceBadgeLabel } from "../src/lib/chat/confidence-labels";

test("confidence badge labels do not describe general answers as local document failures", () => {
  assert.equal(getConfidenceBadgeLabel("none"), "일반 AI 답변");
  assert.equal(getConfidenceBadgeLabel("high"), "로컬 문서 근거 충분");
});
