import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { keyedDigest } from "../security/keyed-digest";
import {
  COMPANION_API_VERSION,
  DEVICE_MAX_PAYLOAD_BYTES,
  DEVICE_TIMESTAMP_TOLERANCE_MS,
  DeviceProtocolError,
  PAIRING_TTL_MS,
  confirmPairingRequestSchema,
  registerDeviceRequestSchema,
  signedEnvelopeSchema,
  type CreatePairingResponse,
  type RegisterDeviceRequest,
  type SignedEnvelope
} from "./device-contract";
import { validatePublicKeySpki, verifyDeviceSignature } from "./device-signature";
import {
  getPairingRepository,
  type PairingRepository,
  type PairingSessionRecord
} from "./pairing.repository";
import { canonicalizeSignedEnvelope } from "./signed-envelope";
import type { DevicePlatform } from "./device.types";

type Dependencies = { repository?: PairingRepository; now?: string };

export async function createPairingSession(
  input: { ownerId: string; platform: DevicePlatform; baseUrl: string },
  dependencies: Dependencies & { publicToken?: string } = {}
): Promise<CreatePairingResponse> {
  const ownerId = input.ownerId.trim();
  if (!ownerId || ownerId.length > 180 || (input.platform !== "android" && input.platform !== "ios")) {
    throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  }
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const now = canonicalNow(dependencies.now);
  const publicToken = dependencies.publicToken || randomBytes(32).toString("base64url");
  if (!/^[A-Za-z0-9_-]{43,128}$/u.test(publicToken)) throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.parse(now) + PAIRING_TTL_MS).toISOString();
  const session: PairingSessionRecord = {
    id: sessionId,
    ownerId,
    platform: input.platform,
    tokenDigest: digest(publicToken, "pairing-public-token"),
    state: "awaiting_device",
    confirmationCodeDigest: null,
    confirmationAttempts: 0,
    keyAlgorithm: null,
    publicKeySpki: null,
    appVersion: null,
    deviceId: null,
    expiresAt,
    registeredAt: null,
    confirmedAt: null,
    createdAt: now,
    updatedAt: now
  };
  await (dependencies.repository || getPairingRepository()).createSession(session);
  const query = new URLSearchParams({ apiVersion: String(COMPANION_API_VERSION), sessionId, token: publicToken });
  return {
    apiVersion: COMPANION_API_VERSION,
    sessionId,
    pairingUrl: `dreamwish://companion/pair?${query.toString()}`,
    fallbackUrl: `${baseUrl}/companion/pair?${query.toString()}`,
    expiresAt
  };
}

export async function registerPairingDevice(
  input: RegisterDeviceRequest & { sessionId: string },
  dependencies: Dependencies & { confirmationCode?: string } = {}
) {
  const { sessionId, ...request } = input;
  const parsed = registerDeviceRequestSchema.safeParse(request);
  if (!parsed.success || !sessionId.trim()) throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  const confirmationCode = dependencies.confirmationCode || String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (!/^\d{6}$/u.test(confirmationCode)) throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  const now = canonicalNow(dependencies.now);
  const publicKeySpki = validatePublicKeySpki(parsed.data.publicKeySpki);
  const session = await (dependencies.repository || getPairingRepository()).registerSession({
    sessionId,
    tokenDigest: digest(parsed.data.publicToken, "pairing-public-token"),
    platform: parsed.data.platform,
    keyAlgorithm: parsed.data.keyAlgorithm,
    publicKeySpki,
    appVersion: parsed.data.appVersion,
    confirmationCodeDigest: digest(confirmationCode, "pairing-confirmation-code"),
    now
  });
  return { apiVersion: COMPANION_API_VERSION, confirmationCode, expiresAt: session.expiresAt };
}

export async function confirmPairingSession(
  input: { ownerId: string; sessionId: string; code: string },
  dependencies: Dependencies = {}
) {
  if (!input.ownerId.trim() || !input.sessionId.trim() || !confirmPairingRequestSchema.safeParse({ code: input.code }).success) {
    throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  }
  const device = await (dependencies.repository || getPairingRepository()).confirmSession({
    ownerId: input.ownerId,
    sessionId: input.sessionId,
    confirmationCodeDigest: digest(input.code, "pairing-confirmation-code"),
    now: canonicalNow(dependencies.now)
  });
  return { apiVersion: COMPANION_API_VERSION, device };
}

export async function getPairingStatus(
  input: { sessionId: string; publicToken: string },
  dependencies: Dependencies = {}
) {
  if (!input.sessionId.trim() || !/^[A-Za-z0-9_-]{43,128}$/u.test(input.publicToken)) {
    throw new DeviceProtocolError("PAIRING_AUTH_INVALID");
  }
  const status = await (dependencies.repository || getPairingRepository()).getSessionStatus({
    sessionId: input.sessionId,
    tokenDigest: digest(input.publicToken, "pairing-public-token"),
    now: canonicalNow(dependencies.now)
  });
  return {
    apiVersion: COMPANION_API_VERSION,
    status: status.state === "confirmed" ? "active" as const : status.state,
    expiresAt: status.expiresAt,
    ...(status.deviceId ? { deviceId: status.deviceId } : {})
  };
}

export async function acceptSignedDeviceEnvelope(
  input: { deviceId: string; envelope: unknown },
  dependencies: Dependencies = {}
) {
  const parsed = signedEnvelopeSchema.safeParse(input.envelope);
  if (!parsed.success || parsed.data.deviceId !== input.deviceId) {
    throw new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
  }
  const envelope: SignedEnvelope = parsed.data;
  if (Buffer.byteLength(JSON.stringify(envelope.payload), "utf8") > DEVICE_MAX_PAYLOAD_BYTES) {
    throw new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
  }
  const now = canonicalNow(dependencies.now);
  if (Math.abs(Date.parse(envelope.sentAt) - Date.parse(now)) > DEVICE_TIMESTAMP_TOLERANCE_MS) {
    throw new DeviceProtocolError("DEVICE_TIMESTAMP_OUT_OF_RANGE");
  }
  const repository = dependencies.repository || getPairingRepository();
  const device = await repository.getDevice(input.deviceId);
  if (!device) throw new DeviceProtocolError("DEVICE_NOT_FOUND");
  if (device.status === "revoked") throw new DeviceProtocolError("DEVICE_REVOKED");
  if (device.status === "paused") throw new DeviceProtocolError("DEVICE_PAUSED");
  verifyDeviceSignature({
    publicKeySpki: device.publicKeySpki,
    canonicalEnvelope: canonicalizeSignedEnvelope(envelope),
    signature: envelope.signature
  });
  const accepted = await repository.acceptSyncEvent({
    deviceId: device.id,
    eventId: envelope.eventId,
    sequence: envelope.sequence,
    payloadType: envelope.payload.type,
    now
  });
  return { device: accepted, payload: envelope.payload, duplicate: false as const };
}

export function readPairingAuthorization(value: string | null) {
  const match = value?.match(/^Bearer\s+([A-Za-z0-9_-]{43,128})$/u);
  if (!match) throw new DeviceProtocolError("PAIRING_AUTH_INVALID");
  return match[1];
}

function digest(value: string, purpose: string) {
  return keyedDigest(value, pairingDigestKey(), `device-${purpose}-v1`);
}

function pairingDigestKey() {
  const configured = process.env.DEVICE_PAIRING_HASH_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("DEVICE_PAIRING_HASH_SECRET is required in production.");
  }
  return Buffer.from("dreamwish-local-device-pairing-key-v1", "utf8").toString("base64");
}

function canonicalNow(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  return date.toISOString();
}

function normalizeBaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
      throw new Error("invalid protocol");
    }
    return url.origin;
  } catch {
    throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  }
}
