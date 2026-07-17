import { randomBytes } from "node:crypto";
import { keyedDigest, safeDigestEqual } from "../security/keyed-digest";

const RECOVERY_CODE_PURPOSE = "dreamwish:recovery-code:v1";

export function generateRecoveryCodes(count = 10): string[] {
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Recovery code count must be a positive integer");
  }

  const codes = new Set<string>();
  while (codes.size < count) {
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
