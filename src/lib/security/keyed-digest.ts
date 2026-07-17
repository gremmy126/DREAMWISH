import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

const HKDF_SALT = Buffer.from("dreamwish-security-v1", "utf8");

export function keyedDigest(
  value: string,
  keyMaterial: string,
  purpose: string
): string {
  const digestKey = Buffer.from(
    hkdfSync(
      "sha256",
      decodeKeyMaterial(keyMaterial),
      HKDF_SALT,
      Buffer.from(`keyed-digest-v1:${purpose}`, "utf8"),
      32
    )
  );
  return createHmac("sha256", digestKey).update(value, "utf8").digest("base64url");
}

export function safeDigestEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeKeyMaterial(keyMaterial: string): Buffer {
  const decoded = /^[0-9a-fA-F]{64}$/u.test(keyMaterial)
    ? Buffer.from(keyMaterial, "hex")
    : decodeBase64(keyMaterial);
  if (process.env.NODE_ENV === "production" && decoded.length < 32) {
    throw new Error("Cryptographic key material must be at least 32 bytes in production");
  }
  return decoded;
}

function decodeBase64(keyMaterial: string): Buffer {
  if (
    keyMaterial.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      keyMaterial
    )
  ) {
    throw new Error("Cryptographic key material must be 64-character hex or valid base64");
  }
  return Buffer.from(keyMaterial, "base64");
}
