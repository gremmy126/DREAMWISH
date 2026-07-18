import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");

test("mobile companion is a standalone bare React Native app with shared screens", () => {
  const pkg = JSON.parse(read("mobile-companion/package.json")) as { dependencies?: Record<string, string>; scripts?: Record<string, string> };
  assert.match(pkg.dependencies?.["react-native"] || "", /0\.86/u);
  assert.ok(pkg.scripts?.android);
  assert.ok(pkg.scripts?.ios);
  assert.match(read("mobile-companion/src/App.tsx"), /Linking/u);
  assert.match(read("mobile-companion/src/screens/PairingScreen.tsx"), /confirmationCode/u);
  assert.match(read("mobile-companion/src/services/pairing.ts"), /publicKeySpki/u);
  assert.doesNotMatch(read("mobile-companion/src/services/pairing.ts"), /deviceSecret/u);
});

test("companion offline queue encrypts entries and signs canonical ES256 envelopes", () => {
  const queue = read("mobile-companion/src/storage/offline-queue.ts");
  const sync = read("mobile-companion/src/services/device-sync.ts") + read("mobile-companion/src/types.ts");
  assert.match(queue, /encryptQueuePayload/u);
  assert.match(queue, /nextAttemptAt/u);
  assert.match(queue, /Math\.min/u);
  assert.match(sync, /canonicalize/u);
  assert.match(sync, /signWithDeviceKey/u);
  assert.match(sync, /apiVersion:\s*1/u);
  assert.match(sync, /device\.sync/u);
});

test("Android uses P-256 Keystore, allowlisted notifications, and WorkManager offline sync", () => {
  const security = read("mobile-companion/android/app/src/main/java/kr/co/dreamwish/companion/security/DeviceKeyModule.kt");
  const listener = read("mobile-companion/android/app/src/main/java/kr/co/dreamwish/companion/capture/NotificationCaptureService.kt");
  const worker = read("mobile-companion/android/app/src/main/java/kr/co/dreamwish/companion/sync/RevenueSyncWorker.kt");
  assert.match(security, /PURPOSE_SIGN/u);
  assert.match(security, /secp256r1|ECGenParameterSpec\("secp256r1"\)/u);
  assert.match(security, /setUserAuthenticationRequired\(false\)/u);
  assert.match(listener, /allowedPackages/u);
  assert.doesNotMatch(listener, /SMS|READ_SMS|READ_CALL_LOG/u);
  assert.match(worker, /CoroutineWorker/u);
  assert.match(worker, /Result\.retry/u);
});

test("iPhone Share Extension accepts explicit bounded text and uses encrypted App Group retry", () => {
  const share = read("mobile-companion/ios/ShareExtension/ShareViewController.swift");
  const queue = read("mobile-companion/ios/DREAMWISHCompanion/EncryptedOfflineQueue.swift");
  assert.match(share, /SLComposeServiceViewController/u);
  assert.match(share, /4_000/u);
  assert.match(share, /SharedRevenueInbox/u);
  assert.match(queue, /AES\.GCM/u);
  assert.match(queue, /group\.kr\.co\.dreamwish\.companion/u);
  assert.match(queue, /retry/u);
  assert.doesNotMatch(share, /notification listener|자동.*알림/u);
});
