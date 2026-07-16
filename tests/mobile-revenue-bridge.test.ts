import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseRevenueSignal,
  redactRevenueText,
  validateRevenueCapture
} from "../src/lib/business/revenue-parser";
import {
  createRevenueCandidate,
  listRevenueCandidates,
  transitionRevenueCandidate
} from "../src/lib/business/revenue.repository";
import { openBankingAdapter } from "../src/lib/business/open-banking-adapter";

test("mobile revenue parser distinguishes income expense cancellation and ambiguity", () => {
  assert.deepEqual(parseRevenueSignal("[KB] 07/11 12:30 입금 50,000원 홍길동 잔액 1,200,000원"), {
    amount: 50000,
    currency: "KRW",
    direction: "income",
    counterpartyHint: "홍길동",
    confidence: 0.92,
    evidence: ["입금", "50,000원"]
  });
  assert.equal(parseRevenueSignal("신한카드 승인 12,300원 스타벅스").direction, "expense");
  assert.equal(parseRevenueSignal("카드 승인취소 12,300원 스타벅스").direction, "cancellation");
  const ambiguous = parseRevenueSignal("은행에서 새로운 알림이 도착했습니다");
  assert.equal(ambiguous.amount, null);
  assert.equal(ambiguous.direction, "unknown");
  assert.ok(ambiguous.confidence < 0.5);
});

test("mobile capture redacts account-like numbers and rejects impossible iOS listener claims", () => {
  assert.equal(
    redactRevenueText("계좌 123-456-789012 입금 10,000원"),
    "계좌 ***-***-789012 입금 10,000원"
  );
  assert.throws(
    () => validateRevenueCapture({ platform: "ios", captureMethod: "notification_listener" }),
    /iPhone does not allow automatic reading/u
  );
  assert.doesNotThrow(() =>
    validateRevenueCapture({ platform: "android", captureMethod: "notification_listener" })
  );
  assert.doesNotThrow(() =>
    validateRevenueCapture({ platform: "ios", captureMethod: "share_extension" })
  );
});

test("revenue candidates are owner scoped idempotent and provisional until confirmed", async () => {
  await withTempDataDir(async () => {
    const first = await createRevenueCandidate({
      ownerId: "owner-a",
      eventId: "event-1",
      platform: "android",
      captureMethod: "notification_listener",
      sourceApp: "com.kbstar.kbbank",
      capturedAt: "2026-07-11T03:30:00.000Z",
      rawText: "입금 50,000원 홍길동"
    });
    const duplicate = await createRevenueCandidate({
      ownerId: "owner-a",
      eventId: "event-1",
      platform: "android",
      captureMethod: "notification_listener",
      sourceApp: "com.kbstar.kbbank",
      capturedAt: "2026-07-11T03:30:00.000Z",
      rawText: "입금 50,000원 홍길동"
    });
    assert.equal(first.id, duplicate.id);
    assert.equal(first.status, "provisional");
    assert.deepEqual(await listRevenueCandidates("owner-b"), []);

    const confirmed = await transitionRevenueCandidate("owner-a", first.id, "confirmed");
    assert.equal(confirmed?.status, "confirmed");
    assert.equal(confirmed?.confirmedAmount, 50000);
    assert.equal(
      await transitionRevenueCandidate("owner-b", first.id, "rejected"),
      null
    );
  });
});

test("mobile companion references enforce platform rules and Open Banking is disabled", async () => {
  const android = await read("mobile-companion/android/NotificationCaptureService.kt");
  const ios = await read("mobile-companion/ios/ShareViewController.swift");
  const guide = await read("mobile-companion/README.md");
  const androidManifest = await read("mobile-companion/android/AndroidManifest.xml");
  const iosInfo = await read("mobile-companion/ios/Info.plist");
  const route = await read("app/api/business/revenue/route.ts");
  // Revenue-candidate review moved from the Business overview to the ERP
  // workspace so the Business page stays operations-focused.
  const businessHub = await read("components/Business/ErpWorkspace.tsx");
  const devicePanel = await read("components/Business/DeviceConnectionPanel.tsx");

  assert.match(android, /NotificationListenerService/u);
  assert.match(android, /allowedPackages/u);
  assert.match(androidManifest, /BIND_NOTIFICATION_LISTENER_SERVICE/u);
  assert.match(ios, /SLComposeServiceViewController/u);
  assert.match(iosInfo, /com\.apple\.share-services/u);
  assert.match(guide, /iPhone[\s\S]*cannot[\s\S]*other apps[\s\S]*notifications/iu);
  assert.match(route, /requireOwnerContext\(request\)/u);
  assert.match(businessHub, /\/api\/business\/revenue/u);
  assert.match(businessHub, /"confirmed"/u);
  assert.match(businessHub, /"rejected"/u);
  assert.match(devicePanel, /Android/u);
  assert.match(devicePanel, /iPhone/u);
  assert.equal(openBankingAdapter.enabled, false);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-revenue-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

function read(relativePath: string) {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf8");
}
