import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyApiAccess } from "../src/lib/auth/api-access-policy";
import {
  acceptDeviceEnvelope,
  createPairingChallenge,
  ingestCalendarCandidates,
  ingestContactCandidates,
  listCalendarCandidates,
  listContactCandidates,
  listOwnerDevices,
  pairDevice,
  revokeDevice
} from "../src/lib/devices/device.repository";

test("device pairing is owner scoped one-time and returns a device secret only once", async () => {
  await withTempDataDir(async () => {
    const challenge = await createPairingChallenge("owner-a", "android");
    await assert.rejects(
      () => pairDevice({ ownerId: "owner-b", challengeId: challenge.id, code: challenge.code, platform: "android", name: "Pixel" }),
      /pairing_owner_mismatch/u
    );

    const paired = await pairDevice({ ownerId: "owner-a", challengeId: challenge.id, code: challenge.code, platform: "android", name: "Pixel" });
    assert.ok(paired.deviceSecret.length >= 32);
    assert.equal((await listOwnerDevices("owner-a"))[0]?.name, "Pixel");
    assert.deepEqual(await listOwnerDevices("owner-b"), []);
    await assert.rejects(
      () => pairDevice({ ownerId: "owner-a", challengeId: challenge.id, code: challenge.code, platform: "android", name: "Pixel 2" }),
      /pairing_challenge_used/u
    );
  });
});

test("device envelopes reject replay and revoked devices", async () => {
  await withTempDataDir(async () => {
    const challenge = await createPairingChallenge("owner-a", "ios");
    const paired = await pairDevice({ ownerId: "owner-a", challengeId: challenge.id, code: challenge.code, platform: "ios", name: "iPhone" });

    const accepted = await acceptDeviceEnvelope(paired.device.id, paired.deviceSecret, 1);
    assert.equal(accepted.ownerId, "owner-a");
    await assert.rejects(() => acceptDeviceEnvelope(paired.device.id, paired.deviceSecret, 1), /device_replay/u);
    await revokeDevice("owner-a", paired.device.id);
    await assert.rejects(() => acceptDeviceEnvelope(paired.device.id, paired.deviceSecret, 2), /device_revoked/u);
  });
});

test("contact and calendar candidates are idempotent and owner isolated", async () => {
  await withTempDataDir(async () => {
    const challenge = await createPairingChallenge("owner-a", "android");
    const paired = await pairDevice({ ownerId: "owner-a", challengeId: challenge.id, code: challenge.code, platform: "android", name: "Galaxy" });
    await ingestContactCandidates("owner-a", paired.device.id, [{ externalId: "contact-1", name: "김민수", phone: "010-1234-5678", email: "minsu@example.com" }]);
    await ingestContactCandidates("owner-a", paired.device.id, [{ externalId: "contact-1", name: "김민수", phone: "010-1234-5678", email: "minsu@example.com" }]);
    await ingestCalendarCandidates("owner-a", paired.device.id, [{ externalId: "event-1", title: "고객 회의", startsAt: "2026-07-14T01:00:00.000Z", endsAt: "2026-07-14T02:00:00.000Z", timezone: "Asia/Seoul", sourceCalendar: "업무" }]);

    assert.equal((await listContactCandidates("owner-a")).length, 1);
    assert.equal((await listCalendarCandidates("owner-a")).length, 1);
    assert.deepEqual(await listContactCandidates("owner-b"), []);
    assert.deepEqual(await listCalendarCandidates("owner-b"), []);
  });
});

test("device routes and companion contracts exclude SMS and call logs", async () => {
  const route = await fs.readFile(path.join(process.cwd(), "app/api/devices/[deviceId]/sync/route.ts"), "utf8");
  const manifest = await fs.readFile(path.join(process.cwd(), "mobile-companion/android/AndroidManifest.xml"), "utf8");
  const info = await fs.readFile(path.join(process.cwd(), "mobile-companion/ios/Info.plist"), "utf8");
  assert.match(route, /contacts/u);
  assert.match(route, /calendarEvents/u);
  assert.doesNotMatch(route, /sms|callLogs|READ_SMS|READ_CALL_LOG/iu);
  assert.doesNotMatch(manifest, /READ_SMS|READ_CALL_LOG/u);
  assert.doesNotMatch(info, /SMS|call log/iu);
});

test("only device-secret endpoints bypass browser session middleware", () => {
  assert.equal(classifyApiAccess("/api/devices/pair"), "public");
  assert.equal(classifyApiAccess("/api/devices/device-1/sync"), "public");
  assert.equal(classifyApiAccess("/api/devices/pairing-challenges"), "protected");
  assert.equal(classifyApiAccess("/api/devices/calendar-candidates"), "protected");
});

test("business and CRM expose real paired-device contact workflows", async () => {
  // The device panel moved with the revenue-candidate review into the ERP
  // workspace when the Business page became operations-focused.
  const business = await fs.readFile(path.join(process.cwd(), "components/Business/ErpWorkspace.tsx"), "utf8");
  const devicePanel = await fs.readFile(path.join(process.cwd(), "components/Business/DeviceConnectionPanel.tsx"), "utf8");
  const contactImport = await fs.readFile(path.join(process.cwd(), "components/CRM/PhoneContactImport.tsx"), "utf8");
  assert.match(business, /DeviceConnectionPanel/u);
  assert.match(devicePanel, /Android 연결/u);
  assert.match(devicePanel, /iPhone 연결/u);
  assert.match(devicePanel, /\/api\/devices\/pairing-challenges/u);
  assert.match(devicePanel, /마지막 동기화/u);
  assert.match(contactImport, /연락처 가져오기/u);
  assert.match(contactImport, /\/api\/devices\/contact-candidates/u);
  assert.match(contactImport, /선택 연락처를 CRM에 추가/u);
});

test("pairing dialog explains that the six digit code is entered in the companion app", async () => {
  const panel = await fs.readFile(
    path.join(process.cwd(), "components/Business/DeviceConnectionPanel.tsx"),
    "utf8"
  );
  assert.match(panel, /설정 → DREAMWISH 연결 → 웹 코드 입력/u);
  assert.match(panel, /웹사이트 입력창이 아니라 휴대폰 컴패니언 앱/u);
  assert.match(panel, /PairingActivity\.kt/u);
  assert.match(panel, /PairingView\.swift/u);
});

test("mobile companion reference clients validate six digits and call the real pairing endpoint", async () => {
  const android = await fs.readFile(
    path.join(process.cwd(), "mobile-companion/android/PairingActivity.kt"),
    "utf8"
  );
  const ios = await fs.readFile(
    path.join(process.cwd(), "mobile-companion/ios/PairingView.swift"),
    "utf8"
  );
  assert.match(android, /Regex\("\\\\d\{6\}"\)/u);
  assert.match(android, /\/api\/devices\/pair/u);
  assert.match(ios, /code\.count == 6/u);
  assert.match(ios, /\/api\/devices\/pair/u);
});

test("mobile contact and calendar reference modules use the device sync contract", async () => {
  for (const relativePath of [
    "mobile-companion/android/SignedEnvelope.kt",
    "mobile-companion/android/ContactSyncWorker.kt",
    "mobile-companion/android/CalendarSyncWorker.kt",
    "mobile-companion/ios/SignedEnvelope.swift",
    "mobile-companion/ios/ContactSyncService.swift",
    "mobile-companion/ios/CalendarSyncService.swift"
  ]) {
    const source = await fs.readFile(path.join(process.cwd(), relativePath), "utf8");
    assert.match(source, /Device|device/u, relativePath);
  }
  const readme = await fs.readFile(
    path.join(process.cwd(), "mobile-companion/README.md"),
    "utf8"
  );
  assert.match(readme, /참조 모듈/u);
  assert.match(readme, /스토어에서 설치 가능한 완성 앱이 아닙니다/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-devices-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
