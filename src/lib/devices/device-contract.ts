import { z } from "zod";

export const COMPANION_API_VERSION = 1 as const;
export const DEVICE_PLATFORMS = ["android", "ios"] as const;
export const DEVICE_KEY_ALGORITHMS = ["ES256"] as const;
export const PAIRING_TTL_MS = 10 * 60 * 1_000;
export const PAIRING_MAX_CODE_ATTEMPTS = 5;
export const DEVICE_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1_000;
export const DEVICE_MAX_PAYLOAD_BYTES = 256 * 1_024;

export const registerDeviceRequestSchema = z.object({
  publicToken: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/u),
  platform: z.enum(DEVICE_PLATFORMS),
  keyAlgorithm: z.literal("ES256"),
  publicKeySpki: z.string().min(80).max(1_024),
  appVersion: z.string().trim().min(1).max(80)
}).strict();

export const confirmPairingRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/u)
}).strict();

const contactSchema = z.object({
  externalId: z.string().trim().min(1).max(256),
  name: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(180).optional(),
  companyName: z.string().max(160).optional(),
  position: z.string().max(100).optional()
}).strict();

const calendarEventSchema = z.object({
  externalId: z.string().trim().min(1).max(256),
  title: z.string().max(200).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().max(80).optional(),
  sourceCalendar: z.string().max(120).optional()
}).strict();

const revenueSignalSchema = z.object({
  eventId: z.string().trim().min(1).max(256),
  sourceApp: z.string().max(200).optional(),
  capturedAt: z.string().datetime().optional(),
  rawText: z.string().min(1).max(4_000)
}).strict();

export const deviceSyncPayloadSchema = z.object({
  apiVersion: z.literal(COMPANION_API_VERSION),
  type: z.literal("device.sync"),
  contacts: z.array(contactSchema).max(500).default([]),
  calendarEvents: z.array(calendarEventSchema).max(500).default([]),
  revenueSignals: z.array(revenueSignalSchema).max(100).default([])
}).strict();

export const devicePushTokenPayloadSchema = z.object({
  apiVersion: z.literal(COMPANION_API_VERSION),
  type: z.literal("device.push-token"),
  action: z.enum(["register", "revoke"]),
  platform: z.enum(DEVICE_PLATFORMS),
  token: z.string().trim().min(16).max(4_096)
}).strict();

export const deviceDisconnectPayloadSchema = z.object({
  apiVersion: z.literal(COMPANION_API_VERSION),
  type: z.literal("device.disconnect")
}).strict();

export const signedDevicePayloadSchema = z.discriminatedUnion("type", [deviceSyncPayloadSchema, devicePushTokenPayloadSchema, deviceDisconnectPayloadSchema]);

export const signedEnvelopeSchema = z.object({
  apiVersion: z.literal(COMPANION_API_VERSION),
  deviceId: z.string().trim().min(1).max(180),
  eventId: z.string().trim().min(1).max(256),
  sequence: z.number().int().safe().positive(),
  sentAt: z.string().datetime(),
  payload: signedDevicePayloadSchema,
  signature: z.string().regex(/^[A-Za-z0-9_-]{64,512}$/u)
}).strict();

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type DeviceSyncPayload = z.infer<typeof deviceSyncPayloadSchema>;
export type DevicePushTokenPayload = z.infer<typeof devicePushTokenPayloadSchema>;
export type DeviceDisconnectPayload = z.infer<typeof deviceDisconnectPayloadSchema>;
export type SignedEnvelope = z.infer<typeof signedEnvelopeSchema>;

export type CreatePairingResponse = {
  apiVersion: typeof COMPANION_API_VERSION;
  sessionId: string;
  pairingUrl: string;
  fallbackUrl: string;
  expiresAt: string;
};

export type DeviceProtocolErrorCode =
  | "PAIRING_REQUEST_INVALID"
  | "PAIRING_SESSION_NOT_FOUND"
  | "PAIRING_AUTH_INVALID"
  | "PAIRING_PLATFORM_MISMATCH"
  | "PAIRING_SESSION_EXPIRED"
  | "PAIRING_ALREADY_REGISTERED"
  | "PAIRING_NOT_REGISTERED"
  | "PAIRING_ALREADY_CONFIRMED"
  | "PAIRING_CODE_INVALID"
  | "PAIRING_CODE_ATTEMPTS_EXCEEDED"
  | "DEVICE_PUBLIC_KEY_INVALID"
  | "DEVICE_ENVELOPE_INVALID"
  | "DEVICE_NOT_FOUND"
  | "DEVICE_SIGNATURE_INVALID"
  | "DEVICE_TIMESTAMP_OUT_OF_RANGE"
  | "DEVICE_SEQUENCE_REPLAY"
  | "DEVICE_EVENT_DUPLICATE"
  | "DEVICE_PAUSED"
  | "DEVICE_REVOKED";

const ERROR_STATUS: Record<DeviceProtocolErrorCode, number> = {
  PAIRING_REQUEST_INVALID: 400,
  PAIRING_SESSION_NOT_FOUND: 404,
  PAIRING_AUTH_INVALID: 401,
  PAIRING_PLATFORM_MISMATCH: 400,
  PAIRING_SESSION_EXPIRED: 410,
  PAIRING_ALREADY_REGISTERED: 409,
  PAIRING_NOT_REGISTERED: 409,
  PAIRING_ALREADY_CONFIRMED: 409,
  PAIRING_CODE_INVALID: 400,
  PAIRING_CODE_ATTEMPTS_EXCEEDED: 429,
  DEVICE_PUBLIC_KEY_INVALID: 400,
  DEVICE_ENVELOPE_INVALID: 400,
  DEVICE_NOT_FOUND: 404,
  DEVICE_SIGNATURE_INVALID: 401,
  DEVICE_TIMESTAMP_OUT_OF_RANGE: 400,
  DEVICE_SEQUENCE_REPLAY: 409,
  DEVICE_EVENT_DUPLICATE: 409,
  DEVICE_PAUSED: 403,
  DEVICE_REVOKED: 403
};

export class DeviceProtocolError extends Error {
  readonly status: number;
  constructor(readonly code: DeviceProtocolErrorCode) {
    super("The companion request could not be completed.");
    this.name = "DeviceProtocolError";
    this.status = ERROR_STATUS[code];
  }
}

export function toDeviceProtocolError(error: unknown) {
  return error instanceof DeviceProtocolError
    ? error
    : new DeviceProtocolError("PAIRING_REQUEST_INVALID");
}
