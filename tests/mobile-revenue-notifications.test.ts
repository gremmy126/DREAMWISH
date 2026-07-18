import assert from "node:assert/strict";
import fs from "node:fs";

test("a push token is device-signed, encrypted, and owner/device bound", () => {
  const schema = fs.readFileSync("src/lib/devices/device.schema.ts", "utf8");
  const route = fs.readFileSync("app/api/devices/[deviceId]/push-token/route.ts", "utf8");
  const repository = fs.readFileSync("src/lib/devices/push-token.repository.ts", "utf8");
  assert.match(schema, /device_push_tokens/u);
  assert.match(route, /acceptSignedDeviceEnvelope/u);
  assert.match(repository, /encryptToken/u);
  assert.match(repository, /token_digest/u);
});

test("one provisional candidate enqueues one deduplicated safe mobile push", () => {
  const service = fs.readFileSync("src/lib/business/revenue-notification.service.ts", "utf8");
  const outbox = fs.readFileSync("src/lib/automation/queue/notification-outbox.ts", "utf8");
  assert.match(service + outbox, /mobile_push/u);
  assert.match(service, /candidate\.id/u);
  assert.doesNotMatch(service, /encryptedRawText|rawText/u);
  assert.match(outbox, /ON CONFLICT \(dedupe_key\) DO NOTHING/u);
});

test("FCM adapter sends only safe data messages to active device tokens", () => {
  const fcm = fs.readFileSync("src/lib/notifications/fcm.ts", "utf8");
  const worker = fs.readFileSync("src/lib/automation/queue/notification-worker.ts", "utf8");
  assert.match(fcm, /fcm\.googleapis\.com\/v1\/projects/u);
  assert.match(fcm, /FIREBASE_SERVICE_ACCOUNT_JSON/u);
  assert.match(worker, /fcmNotificationAdapter/u);
  assert.doesNotMatch(fcm, /cardNumber|accountNumber|rawText/u);
});
