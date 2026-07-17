import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes
} from "node:crypto";

export type AesGcmField = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  authTag: string;
};

const ALGORITHM = "aes-256-gcm";
const HKDF_SALT = Buffer.from("dreamwish-security-v1", "utf8");

export function sealField(input: {
  plaintext: string;
  keyMaterial: string;
  purpose: string;
}): AesGcmField {
  const key = deriveKey(input.keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(authenticatedData(input.purpose));
  const ciphertext = Buffer.concat([
    cipher.update(input.plaintext, "utf8"),
    cipher.final()
  ]);

  return {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function openField(input: {
  field: AesGcmField;
  keyMaterial: string;
  purpose: string;
}): string {
  if (input.field.version !== 1 || input.field.algorithm !== ALGORITHM) {
    throw new Error("Unsupported encrypted field format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(input.keyMaterial),
    Buffer.from(input.field.iv, "base64")
  );
  decipher.setAAD(authenticatedData(input.purpose));
  decipher.setAuthTag(Buffer.from(input.field.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(input.field.ciphertext, "base64")),
    decipher.final()
  ]);
  return plaintext.toString("utf8");
}

function deriveKey(keyMaterial: string): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      decodeKeyMaterial(keyMaterial),
      HKDF_SALT,
      Buffer.from("aes-gcm-field-v1", "utf8"),
      32
    )
  );
}

function authenticatedData(purpose: string): Buffer {
  return Buffer.from(`dreamwish:aes-gcm-field:v1:${purpose}`, "utf8");
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
