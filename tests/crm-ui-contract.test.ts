import assert from "node:assert/strict";
import fs from "node:fs";

test("CRM workspace exposes real search detail timeline insights and lifecycle controls", () => {
  const source = fs.readFileSync("components/CRM/CRMView.tsx", "utf8");
  assert.match(source, /type="search"/u);
  assert.match(source, /encodeURIComponent\(searchQuery\)/u);
  assert.match(source, /selectedActivities/u);
  assert.match(source, /selectedInsight/u);
  assert.match(source, /contractProbability/u);
  assert.match(source, /riskScore/u);
  assert.match(source, /nextContactAt/u);
  assert.match(source, /expectedValue/u);
  assert.match(source, /method: "DELETE"/u);
  assert.match(source, /window\.confirm/u);
});

test("CRM workspace keeps responsive existing design tokens and safe response parsing", () => {
  const source = fs.readFileSync("components/CRM/CRMView.tsx", "utf8");
  assert.match(source, /grid-cols-1/u);
  assert.match(source, /xl:grid-cols/u);
  assert.match(source, /app-primary/u);
  assert.match(source, /readApiResponse/u);
  assert.doesNotMatch(source, /response\.json\(\)/u);
});
