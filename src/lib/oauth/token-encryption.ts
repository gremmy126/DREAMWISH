import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptToken(encryptedToken: string) {
  const [version, ivRaw, authTagRaw, encryptedRaw] = encryptedToken.split(".");
  if (version !== "v1" || !ivRaw || !authTagRaw || !encryptedRaw) {
    throw new Error("지원하지 않는 토큰 암호화 형식입니다.");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function getEncryptionKey() {
  const secret =
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    "dreamwish-local-first-development-token-key";

  return createHash("sha256").update(secret).digest();
}
