import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyApiAccess } from "../src/lib/auth/api-access-policy";
import {
  ingestCalendarCandidates,
  ingestContactCandidates,
  listCalendarCandidates,
  listContactCandidates,
  listOwnerDevices
} from "../src/lib/devices/device.repository";

test("public-key pairing binds owner and platform with ten-minute one-time confirmation", async () => {
  await withTempDataDir(async () => {
    const { JsonPairingRepository } = await import("../src/lib/devices/pairing.repository");
    const { confirmPairingSession, createPairingSession, registerPairingDevice } = await import("../src/lib/devices/pairing.service");
    const repository = new JsonPairingRepository();
    const now = "2026-07-18T00:00:00.000Z";
    const token = randomBytes(32).toString("base64url");
    const key = createDeviceKey();
    const created = await createPairingSession(
      { ownerId: "owner-a", platform: "android", baseUrl: "https://dreamwish.co.kr" },
      { repository, now, publicToken: token }
    );

    assert.deepEqual(Object.keys(created).sort(), ["apiVersion", "expiresAt", "fallbackUrl", "pairingUrl", "sessionId"]);
    assert.equal(created.apiVersion, 1);
    assert.equal(created.expiresAt, "2026-07-18T00:10:00.000Z");
    assert.equal(new URL(created.pairingUrl).searchParams.get("token"), token);
    await assert.rejects(
      () => registerPairingDevice(
        pairingRegistration(created.sessionId, token, key.publicKeySpki, "ios"),
        { repository, now, confirmationCode: "123456" }
      ),
      protocolError("PAIRING_PLATFORM_MISMATCH")
    );

    const registration = await registerPairingDevice(
      pairingRegistration(created.sessionId, token, key.publicKeySpki, "android"),
      { repository, now, confirmationCode: "123456" }
    );
    assert.deepEqual(registration, { apiVersion: 1, confirmationCode: "123456", expiresAt: created.expiresAt });
    await assert.rejects(
      () => confirmPairingSession(
        { ownerId: "owner-b", sessionId: created.sessionId, code: "123456" },
        { repository, now }
      ),
      protocolError("PAIRING_SESSION_NOT_FOUND")
    );
    const confirmationRace = await Promise.allSettled([
      confirmPairingSession({ ownerId: "owner-a", sessionId: created.sessionId, code: "123456" }, { repository, now }),
      confirmPairingSession({ ownerId: "owner-a", sessionId: created.sessionId, code: "123456" }, { repository, now })
    ]);
    const fulfilled = confirmationRace.filter((result) => result.status === "fulfilled");
    const rejected = confirmationRace.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0] as PromiseRejectedResult).reason.code, "PAIRING_ALREADY_CONFIRMED");
    const confirmed = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof confirmPairingSession>>>).value;
    assert.equal(confirmed.device.ownerId, "owner-a");
    assert.equal(confirmed.device.platform, "android");
    assert.equal(confirmed.device.keyAlgorithm, "ES256");
    assert.equal(confirmed.device.publicKeySpki, key.publicKeySpki);
  });
});

test("pairing expires at ten minutes and locks after five wrong confirmation codes", async () => {
  await withTempDataDir(async () => {
    const { JsonPairingRepository } = await import("../src/lib/devices/pairing.repository");
    const { confirmPairingSession, createPairingSession, registerPairingDevice } = await import("../src/lib/devices/pairing.service");
    const repository = new JsonPairingRepository();
    const now = "2026-07-18T00:00:00.000Z";
    const token = randomBytes(32).toString("base64url");
    const key = createDeviceKey();
    const created = await createPairingSession(
      { ownerId: "owner-a", platform: "ios", baseUrl: "https://dreamwish.co.kr" },
      { repository, now, publicToken: token }
    );
    await assert.rejects(
      () => registerPairingDevice(
        pairingRegistration(created.sessionId, token, key.publicKeySpki, "ios"),
        { repository, now: created.expiresAt, confirmationCode: "654321" }
      ),
      protocolError("PAIRING_SESSION_EXPIRED")
    );

    const secondToken = randomBytes(32).toString("base64url");
    const second = await createPairingSession(
      { ownerId: "owner-a", platform: "ios", baseUrl: "https://dreamwish.co.kr" },
      { repository, now, publicToken: secondToken }
    );
    await registerPairingDevice(
      pairingRegistration(second.sessionId, secondToken, key.publicKeySpki, "ios"),
      { repository, now, confirmationCode: "654321" }
    );
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await assert.rejects(
        () => confirmPairingSession(
          { ownerId: "owner-a", sessionId: second.sessionId, code: "000000" },
          { repository, now }
        ),
        protocolError("PAIRING_CODE_INVALID")
      );
    }
    await assert.rejects(
      () => confirmPairingSession(
        { ownerId: "owner-a", sessionId: second.sessionId, code: "000000" },
        { repository, now }
      ),
      protocolError("PAIRING_CODE_ATTEMPTS_EXCEEDED")
    );
    await assert.rejects(
      () => confirmPairingSession(
        { ownerId: "owner-a", sessionId: second.sessionId, code: "654321" },
        { repository, now }
      ),
      protocolError("PAIRING_CODE_ATTEMPTS_EXCEEDED")
    );
  });
});

test("pairing persists only keyed token and code digests and reconstructs after restart", async () => {
  await withTempDataDir(async () => {
    const { JsonPairingRepository } = await import("../src/lib/devices/pairing.repository");
    const { confirmPairingSession, createPairingSession, getPairingStatus, registerPairingDevice } = await import("../src/lib/devices/pairing.service");
    const now = "2026-07-18T00:00:00.000Z";
    const token = randomBytes(32).toString("base64url");
    const key = createDeviceKey();
    const repository = new JsonPairingRepository();
    const created = await createPairingSession(
      { ownerId: "owner-a", platform: "android", baseUrl: "https://dreamwish.co.kr" },
      { repository, now, publicToken: token }
    );
    await registerPairingDevice(
      pairingRegistration(created.sessionId, token, key.publicKeySpki, "android"),
      { repository, now, confirmationCode: "246810" }
    );

    const persistedBeforeConfirmation = await fs.readFile(path.join(process.env.DATA_DIR!, "device-pairing.json"), "utf8");
    assert.doesNotMatch(persistedBeforeConfirmation, new RegExp(token, "u"));
    assert.doesNotMatch(persistedBeforeConfirmation, /246810/u);
    assert.match(persistedBeforeConfirmation, /"tokenDigest"\s*:\s*"[A-Za-z0-9_-]{43}"/u);
    assert.match(persistedBeforeConfirmation, /"confirmationCodeDigest"\s*:\s*"[A-Za-z0-9_-]{43}"/u);

    const restartedRepository = new JsonPairingRepository();
    await assert.rejects(
      () => getPairingStatus(
        { sessionId: created.sessionId, publicToken: randomBytes(32).toString("base64url") },
        { repository: restartedRepository, now }
      ),
      protocolError("PAIRING_AUTH_INVALID")
    );
    assert.equal((await getPairingStatus(
      { sessionId: created.sessionId, publicToken: token },
      { repository: restartedRepository, now }
    )).status, "awaiting_confirmation");
    const confirmed = await confirmPairingSession(
      { ownerId: "owner-a", sessionId: created.sessionId, code: "246810" },
      { repository: restartedRepository, now }
    );
    assert.equal((await new JsonPairingRepository().getDevice(confirmed.device.id))?.id, confirmed.device.id);
    const persistedAfterConfirmation = await fs.readFile(path.join(process.env.DATA_DIR!, "device-pairing.json"), "utf8");
    assert.doesNotMatch(persistedAfterConfirmation, /246810/u);
    assert.doesNotMatch(persistedAfterConfirmation, /"signature"|"payload"/u);
  });
});

test("ES256 validation accepts only P-256 SPKI and canonical signed envelopes omit signatures", async () => {
  const { validatePublicKeySpki } = await import("../src/lib/devices/device-signature");
  const { canonicalizeSignedEnvelope } = await import("../src/lib/devices/signed-envelope");
  const p256 = createDeviceKey();
  assert.equal(validatePublicKeySpki(p256.publicKeySpki), p256.publicKeySpki);
  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey
    .export({ type: "spki", format: "der" }).toString("base64");
  assert.throws(() => validatePublicKeySpki(rsa), protocolError("DEVICE_PUBLIC_KEY_INVALID"));

  const canonical = canonicalizeSignedEnvelope({
    z: 2,
    payload: { z: 1, a: [{ c: 3, b: 2 }] },
    signature: "must-not-be-signed",
    a: 1
  });
  assert.equal(canonical, '{"a":1,"payload":{"a":[{"b":2,"c":3}],"z":1},"z":2}');
  assert.doesNotMatch(canonical, /signature/u);
});

test("signed envelopes verify ES256 and atomically reject tamper replay duplicate stale paused and revoked requests", async () => {
  await withTempDataDir(async () => {
    const { JsonPairingRepository } = await import("../src/lib/devices/pairing.repository");
    const { acceptSignedDeviceEnvelope } = await import("../src/lib/devices/pairing.service");
    const { canonicalizeSignedEnvelope } = await import("../src/lib/devices/signed-envelope");
    const repository = new JsonPairingRepository();
    const now = "2026-07-18T00:05:00.000Z";
    const paired = await pairTestDevice({ repository, now, platform: "android" });

    const first = signEnvelope({
      deviceId: paired.device.id,
      eventId: "event-1",
      sequence: 1,
      sentAt: now,
      privateKey: paired.privateKey,
      canonicalizeSignedEnvelope
    });
    const accepted = await acceptSignedDeviceEnvelope(
      { deviceId: paired.device.id, envelope: first },
      { repository, now }
    );
    assert.equal(accepted.device.lastSequence, 1);
    assert.equal(accepted.duplicate, false);

    const tampered = structuredClone(signEnvelope({
      deviceId: paired.device.id,
      eventId: "event-2",
      sequence: 2,
      sentAt: now,
      privateKey: paired.privateKey,
      canonicalizeSignedEnvelope
    }));
    tampered.payload.contacts = [{ externalId: "tampered", name: "Mallory" }];
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: tampered }, { repository, now }),
      protocolError("DEVICE_SIGNATURE_INVALID")
    );

    const sequenceRace = await Promise.allSettled([
      acceptSignedDeviceEnvelope({
        deviceId: paired.device.id,
        envelope: signEnvelope({ deviceId: paired.device.id, eventId: "event-race-a", sequence: 2, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope })
      }, { repository, now }),
      acceptSignedDeviceEnvelope({
        deviceId: paired.device.id,
        envelope: signEnvelope({ deviceId: paired.device.id, eventId: "event-race-b", sequence: 2, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope })
      }, { repository, now })
    ]);
    assert.equal(sequenceRace.filter((result) => result.status === "fulfilled").length, 1);
    const sequenceRejected = sequenceRace.find((result) => result.status === "rejected") as PromiseRejectedResult;
    assert.equal(sequenceRejected.reason.code, "DEVICE_SEQUENCE_REPLAY");

    const replay = signEnvelope({ deviceId: paired.device.id, eventId: "event-replay", sequence: 1, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope });
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: replay }, { repository, now }),
      protocolError("DEVICE_SEQUENCE_REPLAY")
    );
    const duplicate = signEnvelope({ deviceId: paired.device.id, eventId: "event-1", sequence: 3, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope });
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: duplicate }, { repository, now }),
      protocolError("DEVICE_EVENT_DUPLICATE")
    );
    const stale = signEnvelope({ deviceId: paired.device.id, eventId: "event-stale", sequence: 2, sentAt: "2026-07-17T23:59:59.999Z", privateKey: paired.privateKey, canonicalizeSignedEnvelope });
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: stale }, { repository, now }),
      protocolError("DEVICE_TIMESTAMP_OUT_OF_RANGE")
    );

    await repository.setDeviceStatus("owner-a", paired.device.id, "paused", now);
    const paused = signEnvelope({ deviceId: paired.device.id, eventId: "event-paused", sequence: 2, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope });
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: paused }, { repository, now }),
      protocolError("DEVICE_PAUSED")
    );
    await repository.setDeviceStatus("owner-a", paired.device.id, "revoked", now);
    const revoked = signEnvelope({ deviceId: paired.device.id, eventId: "event-revoked", sequence: 2, sentAt: now, privateKey: paired.privateKey, canonicalizeSignedEnvelope });
    await assert.rejects(
      () => acceptSignedDeviceEnvelope({ deviceId: paired.device.id, envelope: revoked }, { repository, now }),
      protocolError("DEVICE_REVOKED")
    );
  });
});

test("device schema contract and routes expose version one without legacy shared secrets", async () => {
  const schemaSource = await fs.readFile(path.join(process.cwd(), "src/lib/devices/device.schema.ts"), "utf8");
  const serviceSource = await fs.readFile(path.join(process.cwd(), "src/lib/devices/pairing.service.ts"), "utf8");
  for (const table of ["device_pairing_sessions", "paired_devices", "device_sync_events", "device_audit_events"]) {
    assert.match(schemaSource, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
  }
  assert.match(schemaSource, /key_algorithm\s+TEXT\s+NOT NULL\s+CHECK\s+\(key_algorithm = 'ES256'\)/u);
  assert.match(schemaSource, /UNIQUE\s*\(device_id,\s*event_id\)/u);
  assert.match(schemaSource, /append.only/iu);
  assert.match(serviceSource, /process\.env\.DEVICE_PAIRING_HASH_SECRET/u);
  assert.doesNotMatch(serviceSource, /DEVICE_PAIRING_TOKEN_KEY/u);

  const contract = JSON.parse(await fs.readFile(path.join(process.cwd(), "public/contracts/companion-v1.schema.json"), "utf8")) as {
    properties?: { apiVersion?: { const?: number } };
    $defs?: Record<string, unknown>;
  };
  assert.equal(contract.properties?.apiVersion?.const, 1);
  for (const definition of ["CreatePairingResponse", "RegisterDeviceRequest", "SignedEnvelope"]) {
    assert.ok(contract.$defs?.[definition], definition);
  }

  const legacyRoute = await fs.readFile(path.join(process.cwd(), "app/api/devices/pair/route.ts"), "utf8");
  assert.match(legacyRoute, /status:\s*410/u);
  assert.match(legacyRoute, /DEVICE_PAIRING_PROTOCOL_UPGRADE_REQUIRED/u);
  assert.doesNotMatch(legacyRoute, /pairDevice|deviceSecret/u);
});

test("pairing registration and status are public while confirmation stays owner authenticated", () => {
  assert.equal(classifyApiAccess("/api/devices/pairing-challenges/session-1/register"), "public");
  assert.equal(classifyApiAccess("/api/devices/pairing-challenges/session-1/status"), "public");
  assert.equal(classifyApiAccess("/api/devices/pairing-challenges/session-1/confirm"), "protected");
});

test("contact and calendar candidates are idempotent and owner isolated", async () => {
  await withTempDataDir(async () => {
    const { JsonPairingRepository } = await import("../src/lib/devices/pairing.repository");
    const paired = await pairTestDevice({ repository: new JsonPairingRepository(), now: "2026-07-18T00:00:00.000Z", platform: "android" });
    await ingestContactCandidates("owner-a", paired.device.id, [{ externalId: "contact-1", name: "Minsu", phone: "010-1234-5678", email: "minsu@example.com" }]);
    await ingestContactCandidates("owner-a", paired.device.id, [{ externalId: "contact-1", name: "Minsu", phone: "010-1234-5678", email: "minsu@example.com" }]);
    await ingestCalendarCandidates("owner-a", paired.device.id, [{ externalId: "event-1", title: "Customer meeting", startsAt: "2026-07-14T01:00:00.000Z", endsAt: "2026-07-14T02:00:00.000Z", timezone: "Asia/Seoul", sourceCalendar: "Work" }]);

    assert.equal((await listContactCandidates("owner-a")).length, 1);
    assert.equal((await listCalendarCandidates("owner-a")).length, 1);
    assert.deepEqual(await listContactCandidates("owner-b"), []);
    assert.deepEqual(await listCalendarCandidates("owner-b"), []);
    assert.equal((await listOwnerDevices("owner-a"))[0]?.id, paired.device.id);
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

test("only public-key companion endpoints bypass browser session middleware", () => {
  assert.equal(classifyApiAccess("/api/devices/pair"), "public");
  assert.equal(classifyApiAccess("/api/devices/device-1/sync"), "public");
  assert.equal(classifyApiAccess("/api/devices/pairing-challenges"), "protected");
  assert.equal(classifyApiAccess("/api/devices/calendar-candidates"), "protected");
});

test("business and CRM expose real paired-device contact workflows", async () => {
  const business = await fs.readFile(path.join(process.cwd(), "components/Business/ErpWorkspace.tsx"), "utf8");
  const devicePanel = await fs.readFile(path.join(process.cwd(), "components/Business/DeviceConnectionPanel.tsx"), "utf8");
  const contactImport = await fs.readFile(path.join(process.cwd(), "components/CRM/PhoneContactImport.tsx"), "utf8");
  assert.match(business, /DeviceConnectionPanel/u);
  assert.match(devicePanel, /Android/u);
  assert.match(devicePanel, /iPhone/u);
  assert.match(devicePanel, /\/api\/devices\/pairing-challenges/u);
  assert.match(contactImport, /\/api\/devices\/contact-candidates/u);
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
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const previousDigestKey = process.env.DEVICE_PAIRING_HASH_SECRET;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-devices-"));
  process.env.DATA_DIR = dataDir;
  process.env.DEVICE_PAIRING_HASH_SECRET = Buffer.alloc(32, 7).toString("base64");
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    if (previousDigestKey === undefined) delete process.env.DEVICE_PAIRING_HASH_SECRET;
    else process.env.DEVICE_PAIRING_HASH_SECRET = previousDigestKey;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

function createDeviceKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey,
    publicKeySpki: publicKey.export({ type: "spki", format: "der" }).toString("base64")
  };
}

function pairingRegistration(sessionId: string, publicToken: string, publicKeySpki: string, platform: "android" | "ios") {
  return { sessionId, publicToken, platform, keyAlgorithm: "ES256" as const, publicKeySpki, appVersion: "1.0.0" };
}

async function pairTestDevice(input: {
  repository: import("../src/lib/devices/pairing.repository").PairingRepository;
  now: string;
  platform: "android" | "ios";
}) {
  const { confirmPairingSession, createPairingSession, registerPairingDevice } = await import("../src/lib/devices/pairing.service");
  const key = createDeviceKey();
  const token = randomBytes(32).toString("base64url");
  const created = await createPairingSession(
    { ownerId: "owner-a", platform: input.platform, baseUrl: "https://dreamwish.co.kr" },
    { repository: input.repository, now: input.now, publicToken: token }
  );
  await registerPairingDevice(
    pairingRegistration(created.sessionId, token, key.publicKeySpki, input.platform),
    { repository: input.repository, now: input.now, confirmationCode: "123456" }
  );
  const confirmed = await confirmPairingSession(
    { ownerId: "owner-a", sessionId: created.sessionId, code: "123456" },
    { repository: input.repository, now: input.now }
  );
  return { device: confirmed.device, privateKey: key.privateKey };
}

function signEnvelope(input: {
  deviceId: string;
  eventId: string;
  sequence: number;
  sentAt: string;
  privateKey: ReturnType<typeof createDeviceKey>["privateKey"];
  canonicalizeSignedEnvelope: (value: Record<string, unknown>) => string;
}) {
  const unsigned = {
    apiVersion: 1 as const,
    deviceId: input.deviceId,
    eventId: input.eventId,
    sequence: input.sequence,
    sentAt: input.sentAt,
    payload: {
      apiVersion: 1 as const,
      type: "device.sync" as const,
      contacts: [] as Array<{ externalId: string; name?: string }>,
      calendarEvents: [] as unknown[],
      revenueSignals: [] as unknown[]
    }
  };
  const signature = sign("sha256", Buffer.from(input.canonicalizeSignedEnvelope(unsigned), "utf8"), input.privateKey).toString("base64url");
  return { ...unsigned, signature };
}

function protocolError(code: string) {
  return (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    assert.doesNotMatch(String((error as Error).message || ""), /token|246810|123456|654321|signature|payload/iu);
    return true;
  };
}
