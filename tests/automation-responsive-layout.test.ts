import assert from "node:assert/strict";
import fs from "node:fs";

test("Automation keeps three columns from 1024px and exposes mobile panel controls below it", () => {
  const source = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.match(source, /lg:grid-cols-\[clamp\(180px,18vw,210px\)_minmax\(0,1fr\)_clamp\(260px,24vw,300px\)\]/u);
  assert.match(source, /앱 추가/u);
  assert.match(source, /모듈 설정 열기/u);
  assert.match(source, /lg:hidden/u);
  assert.match(source, /hidden min-w-0 overflow-hidden bg-white lg:block/u);
  assert.match(source, /ResponsiveAutomationPanel/u);
});

test("responsive panels implement accessible drawer and bottom sheet behavior", () => {
  const source = fs.readFileSync("components/Automation/ResponsiveAutomationPanel.tsx", "utf8");
  for (const contract of [
    /role="dialog"/u,
    /aria-modal="true"/u,
    /Escape/u,
    /focusableElements/u,
    /previousFocus/u,
    /safe-area-inset-bottom/u,
    /100dvh/u,
    /sm:h-\[100dvh\]/u,
    /sm:max-w/u,
    /min-h-11/u
  ]) assert.match(source, contract);
});

test("React Flow recalculates after panel and container resize without changing its visual primitives", () => {
  const source = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.match(source, /ResizeObserver/u);
  assert.match(source, /reactFlowInstance/u);
  assert.match(source, /fitView\(\{ padding: 0\.2/u);
  assert.match(source, /onInit=/u);
  assert.match(source, /hidden sm:block/u);
  for (const existingPrimitive of ["<Background", "<MiniMap", "<Controls", "defaultEdgeOptions"]) {
    assert.ok(source.includes(existingPrimitive), `missing React Flow primitive: ${existingPrimitive}`);
  }
});

test("mobile execution history keeps touch targets and stacked detail cards", () => {
  const source = fs.readFileSync("components/Automation/DurableRunHistory.tsx", "utf8");
  assert.match(source, /min-h-11/u);
  assert.match(source, /sm:grid-cols-4/u);
  assert.match(source, /max-sm:/u);
});
