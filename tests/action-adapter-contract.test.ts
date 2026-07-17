import assert from "node:assert/strict";
import fs from "node:fs";
import { isActionExecutable } from "../src/lib/automation/registry/action-registry";
import { listImplementedAdapterKeys } from "../src/lib/automation/adapters/adapter-availability";
import { ACTION_DEFINITIONS } from "../src/lib/automation/registry/action-registry";
import { hasRegisteredActionAdapter } from "../src/lib/automation/adapters/action-adapter.registry";

test("action executability is based on a real versioned adapter implementation", () => {
  assert.equal(isActionExecutable("gmail", "send-email", 1), true);
  assert.equal(isActionExecutable("github", "create-release", 1), true);
  assert.equal(isActionExecutable("stripe", "refund-payment", 1), false);
  assert.equal(isActionExecutable("drive", "upload-file", 1), false);
  assert.ok(listImplementedAdapterKeys().every((key) => key.endsWith("@1")));
});

test("every advertised executable action resolves to a server adapter", () => {
  for (const definition of ACTION_DEFINITIONS) {
    if (isActionExecutable(definition.appId, definition.id, definition.version)) {
      assert.equal(hasRegisteredActionAdapter(definition), true, definition.adapterKey);
    }
  }
});

test("action picker truthfully disables actions whose adapters are not implemented", () => {
  const source = fs.readFileSync("components/Automation/ActionPicker.tsx", "utf8");
  assert.match(source, /isActionExecutable/u);
  assert.match(source, /disabled=/u);
  assert.match(source, /준비 중/u);
});

test("server adapter contract requires explicit idempotency and connection identity", () => {
  const source = fs.readFileSync("src/lib/automation/adapters/action-adapter.types.ts", "utf8");
  assert.match(source, /idempotencyKey: string/u);
  assert.match(source, /connectionId: string \| null/u);
  assert.match(source, /adapterVersion: number/u);
});
