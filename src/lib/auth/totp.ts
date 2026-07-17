import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { TotpVerification } from "./totp.types";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const ISSUER = "DREAMWISH";
const STEP_MS = 30_000;
const DIGITS = 6;
const ACCEPTED_DRIFT_STEPS = 1;
const CLOCK_DRIFT_DIAGNOSTIC_STEPS = 10;

export function generateTotpSecret(bytes = 20): string {
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new Error("TOTP secret byte length must be a positive integer");
  }
  return encodeBase32(randomBytes(bytes));
}

export function createTotpUri(input: { secret: string; email: string }): string {
  const secret = normalizeBase32Secret(input.secret);
  decodeBase32(secret);
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(input.email.trim())}`;

  return (
    `otpauth://totp/${label}?secret=${encodeURIComponent(secret)}` +
    `&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=30`
  );
}

export function generateTotpCode(input: { secret: string; nowMs: number }): string {
  return generateCodeForCounter(input.secret, counterForTime(input.nowMs));
}

export function verifyTotpCode(input: {
  secret: string;
  code: string;
  nowMs: number;
  lastAcceptedCounter: number | null;
}): TotpVerification {
  if (!/^\d{6}$/u.test(input.code)) {
    return { ok: false, reason: "invalid" };
  }

  const currentCounter = counterForTime(input.nowMs);
  const acceptedMatches: number[] = [];

  for (
    let counter = Math.max(0, currentCounter - ACCEPTED_DRIFT_STEPS);
    counter <= currentCounter + ACCEPTED_DRIFT_STEPS;
    counter += 1
  ) {
    if (codesEqual(generateCodeForCounter(input.secret, counter), input.code)) {
      acceptedMatches.push(counter);
    }
  }

  if (acceptedMatches.length > 0) {
    const replayFloor = input.lastAcceptedCounter ?? -1;
    const newestUnusedCounter = acceptedMatches
      .filter((counter) => counter > replayFloor)
      .sort((left, right) => right - left)[0];

    return newestUnusedCounter === undefined
      ? { ok: false, reason: "replayed" }
      : { ok: true, counter: newestUnusedCounter };
  }

  for (
    let offset = -CLOCK_DRIFT_DIAGNOSTIC_STEPS;
    offset <= CLOCK_DRIFT_DIAGNOSTIC_STEPS;
    offset += 1
  ) {
    if (Math.abs(offset) <= ACCEPTED_DRIFT_STEPS) continue;
    const counter = currentCounter + offset;
    if (counter < 0) continue;
    if (codesEqual(generateCodeForCounter(input.secret, counter), input.code)) {
      return { ok: false, reason: "clock_drift" };
    }
  }

  return { ok: false, reason: "invalid" };
}

function counterForTime(nowMs: number): number {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error("TOTP time must be a non-negative finite value");
  }
  return Math.floor(nowMs / STEP_MS);
}

function generateCodeForCounter(secret: string, counter: number): string {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBytes).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(binaryCode % 10 ** DIGITS).padStart(DIGITS, "0");
}

function encodeBase32(value: Buffer): string {
  let output = "";
  let bits = 0;
  let buffer = 0;

  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_ALPHABET[(buffer >>> bits) & 0x1f];
    }
    buffer &= (1 << bits) - 1;
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(buffer << (5 - bits)) & 0x1f];
  }
  return output;
}

function decodeBase32(secret: string): Buffer {
  const normalized = normalizeBase32Secret(secret);
  if (
    !/^[A-Z2-7]+$/u.test(normalized) ||
    ![0, 2, 4, 5, 7].includes(normalized.length % 8)
  ) {
    throw new Error("Invalid base32 TOTP secret");
  }

  const bytes: number[] = [];
  let bits = 0;
  let buffer = 0;

  for (const character of normalized) {
    buffer = (buffer << 5) | BASE32_ALPHABET.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
    buffer &= (1 << bits) - 1;
  }

  if (bits > 0 && buffer !== 0) {
    throw new Error("Invalid base32 TOTP secret");
  }
  return Buffer.from(bytes);
}

function normalizeBase32Secret(secret: string): string {
  return secret.trim().toUpperCase();
}

function codesEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
