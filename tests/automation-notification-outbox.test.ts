import assert from "node:assert/strict";
import fs from "node:fs";
import { notificationDedupeKey, normalizeNotificationChannels } from "../src/lib/automation/queue/notification-outbox";

test("notification channels are explicit unique and multi-select", () => {
  assert.deepEqual(normalizeNotificationChannels(["email", "slack", "email", "browser", "mobile", "in_app"]), [
    "email", "slack", "browser", "mobile", "in_app"
  ]);
  assert.deepEqual(normalizeNotificationChannels(["unknown"]), ["in_app"]);
});

test("outbox dedupe keys are stable per event channel and recipient", () => {
  const first = notificationDedupeKey("approval-1", "warning", "slack", "owner-1");
  const second = notificationDedupeKey("approval-1", "warning", "slack", "owner-1");
  assert.equal(first, second);
  assert.notEqual(first, notificationDedupeKey("approval-1", "warning", "email", "owner-1"));
});

test("outbox and inbox persistence use database uniqueness rather than memory", () => {
  const source = fs.readFileSync("src/lib/automation/queue/notification-outbox.ts", "utf8");
  assert.match(source, /INSERT INTO automation_notification_outbox/u);
  assert.match(source, /ON CONFLICT \(dedupe_key\) DO NOTHING/u);
  assert.match(source, /INSERT INTO automation_notification_inbox/u);
  assert.doesNotMatch(source, /new Map/u);
});
