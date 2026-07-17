import { randomBytes } from "node:crypto";
import { keyedDigest, safeDigestEqual } from "../security/keyed-digest";

const RECOVERY_CODE_PURPOSE = "dreamwish:recovery-code:v1";
const RECOVERY_CODE_COUNT = 10;

export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) {
    const value = randomBytes(8).toString("hex").toUpperCase();
    codes.add(value.match(/.{4}/gu)!.join("-"));
  }
  return [...codes];
}

export function hashRecoveryCode(input: {
  code: string;
  keyMaterial: string;
}): string {
  return keyedDigest(
    normalizeRecoveryCode(input.code),
    input.keyMaterial,
    RECOVERY_CODE_PURPOSE
  );
}

export function verifyRecoveryCodeHash(input: {
  code: string;
  keyMaterial: string;
  hash: string;
}): boolean {
  let normalizedCode: string;
  try {
    normalizedCode = normalizeRecoveryCode(input.code);
  } catch {
    return false;
  }

  const candidateHash = keyedDigest(
    normalizedCode,
    input.keyMaterial,
    RECOVERY_CODE_PURPOSE
  );
  return safeDigestEqual(candidateHash, input.hash);
}

function normalizeRecoveryCode(code: string): string {
  const normalized = code.trim().replace(/-/gu, "").toUpperCase();
  if (!/^[A-F0-9]{16}$/u.test(normalized)) {
    throw new Error("Invalid recovery code format");
  }
  return normalized;
}
