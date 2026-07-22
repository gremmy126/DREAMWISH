import assert from "node:assert/strict";
import fs from "node:fs";

const route = fs.readFileSync("app/api/ai/agent-build/route.ts", "utf8");
const studio = fs.readFileSync("components/Agents/AgentStudio.tsx", "utf8");
const store = fs.readFileSync("components/billing/AiCreditStore.tsx", "utf8");

test("the AI Agent runs a metered completion when a credit tier is selected", () => {
  assert.match(route, /runMeteredCompletion/u);
  assert.match(route, /surface:\s*"agent"/u);
  // A selected tier drives the paid path; no tier keeps the free chatWithAI path.
  assert.match(route, /plan\.tierId/u);
  assert.match(route, /chatWithAI/u);
});

test("agent-build maps credit errors to actionable statuses", () => {
  assert.match(route, /AI_CREDIT_INSUFFICIENT[\s\S]*status:\s*402/u);
  assert.match(route, /AI_TIER_NOT_CONFIGURED/u);
});

test("the Agent studio lets the user pick a credit tier and sends its id", () => {
  assert.match(studio, /\/api\/ai\/credit-products/u);
  assert.match(studio, /tierId:\s*selectedTierId\s*\|\|\s*undefined/u);
});

test("the credit store buys via the AI-credit checkout and verify endpoints", () => {
  assert.match(store, /\/api\/billing\/domestic\/ai-credits\/checkout/u);
  assert.match(store, /\/api\/billing\/domestic\/ai-credits\/verify/u);
  assert.match(store, /\/api\/ai\/credit-products/u);
  assert.match(store, /\/api\/ai\/usage/u);
  // The checkout request sends only tierId + quantity — never a client price.
  assert.match(store, /body:\s*JSON\.stringify\(\{\s*tierId:\s*tier\.id,\s*quantity\s*\}\)/u);
});
