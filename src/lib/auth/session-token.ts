import { isAdminEmail, normalizeEmail, type AccountRole } from "./access-control";

export const SESSION_COOKIE_NAME = "dreamwish-session" as const;
export const SESSION_MAX_AGE_SECONDS = 60 * 60;

const MIN_SECRET_BYTES = 32;
const MAX_CLOCK_SKEW_SECONDS = 60;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type SessionClaims = {
  uid: string;
  email: string;
  name: string | null;
  role: AccountRole;
  paid: boolean;
  iat: number;
  exp: number;
};

export type CreateSessionClaims = Pick<SessionClaims, "uid" | "email" | "paid"> &
  Partial<Pick<SessionClaims, "name" | "iat" | "exp">>;

export async function createSessionToken(input: CreateSessionClaims): Promise<string> {
  const secret = getSessionSecret();
  const claims = buildClaims(input);
  const payload = encodeBase64Url(textEncoder.encode(JSON.stringify(claims)));
  const signature = await sign(payload, secret);

  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  const secret = getSessionSecret();

  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [payload, encodedSignature] = parts;

  try {
    const signature = decodeBase64Url(encodedSignature);
    const key = await importSigningKey(secret, ["verify"]);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      textEncoder.encode(payload)
    );
    if (!validSignature) return null;

    const parsed: unknown = JSON.parse(textDecoder.decode(decodeBase64Url(payload)));
    if (!isSessionClaims(parsed)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (parsed.iat > now + MAX_CLOCK_SKEW_SECONDS) return null;
    if (parsed.exp <= now || parsed.exp <= parsed.iat) return null;

    return parsed;
  } catch {
    return null;
  }
}

function buildClaims(input: CreateSessionClaims): SessionClaims {
  const uid = typeof input.uid === "string" ? input.uid.trim() : "";
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const name = input.name == null ? null : input.name.trim() || null;
  const now = Math.floor(Date.now() / 1000);
  const iat = input.iat ?? now;
  const exp = input.exp ?? iat + SESSION_MAX_AGE_SECONDS;

  if (!uid) throw new Error("Session claims require a Firebase uid.");
  if (!email || !email.includes("@")) throw new Error("Session claims require an email.");
  if (typeof input.paid !== "boolean") throw new Error("Session claims require paid status.");
  if (!Number.isInteger(iat) || iat <= 0) throw new Error("Session claims require a valid iat.");
  if (!Number.isInteger(exp) || exp <= iat) throw new Error("Session claims require a valid exp.");

  return {
    uid,
    email,
    name,
    role: isAdminEmail(email) ? "admin" : "user",
    paid: isAdminEmail(email) || input.paid,
    iat,
    exp
  };
}

function isSessionClaims(value: unknown): value is SessionClaims {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const claims = value as Record<string, unknown>;
  return (
    typeof claims.uid === "string" &&
    claims.uid.trim().length > 0 &&
    typeof claims.email === "string" &&
    claims.email.length > 0 &&
    (claims.name === null || typeof claims.name === "string") &&
    (claims.role === "admin" || claims.role === "user") &&
    typeof claims.paid === "boolean" &&
    Number.isInteger(claims.iat) &&
    Number.isInteger(claims.exp) &&
    (claims.iat as number) > 0
  );
}

function getSessionSecret(): Uint8Array<ArrayBuffer> {
  const value = process.env.AUTH_SESSION_SECRET;
  const encoded = textEncoder.encode(value || "");

  if (encoded.byteLength < MIN_SECRET_BYTES) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 bytes.");
  }

  return encoded;
}

async function sign(
  payload: string,
  secret: Uint8Array<ArrayBuffer>
): Promise<ArrayBuffer> {
  const key = await importSigningKey(secret, ["sign"]);
  return crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
}

function importSigningKey(secret: Uint8Array<ArrayBuffer>, usages: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages
  );
}

function encodeBase64Url(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);

  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid base64url value.");
  }

  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
