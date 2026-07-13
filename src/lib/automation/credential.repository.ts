import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";

export type AutomationCredential = {
  id: string;
  appId: string;
  label: string;
  masked: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId?: CredentialKeyId;
  accountLabel?: string | null;
  providerAccountId?: string | null;
  verificationStatus?: "verified" | "needs_reconnect";
  verifiedAt?: string | null;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
};

export type CredentialKeyId = "automation" | "integration" | "oauth" | "development";
export type CredentialPersistenceCode =
  | "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED"
  | "CREDENTIAL_DATABASE_UNAVAILABLE"
  | "CREDENTIAL_WRITE_FAILED";

export class CredentialPersistenceError extends Error {
  constructor(
    public readonly code: CredentialPersistenceCode,
    message: string,
    public readonly status = 500
  ) {
    super(message);
    this.name = "CredentialPersistenceError";
  }
}

export function isCredentialPersistenceError(
  error: unknown
): error is CredentialPersistenceError {
  return error instanceof CredentialPersistenceError;
}

export type PublicAutomationCredential = Omit<AutomationCredential, "ciphertext" | "iv" | "authTag">;
type CredentialDocument = { credentials: AutomationCredential[] };
type CredentialFallbackDb = { owners: Record<string, CredentialDocument> };
const NAMESPACE = "automation-credentials-v1";
const EMPTY_DOCUMENT: CredentialDocument = { credentials: [] };
const EMPTY_DB: CredentialFallbackDb = { owners: {} };

export async function listCredentials(ownerId: string): Promise<PublicAutomationCredential[]> {
  return (await readDocument(ownerId)).credentials.map(toPublicCredential);
}

export async function saveCredential(input: { ownerId: string; appId: string; label: string; secret: string }) {
  if (!input.secret.trim()) throw new Error("API 키를 입력하세요.");
  return saveEncryptedCredential(input, input.secret.trim(), maskSecret(input.secret));
}

export async function saveCredentialValues(input: {
  ownerId: string;
  appId: string;
  label: string;
  values: Record<string, string>;
}) {
  const values = Object.fromEntries(
    Object.entries(input.values).map(([key, value]) => [key, value.trim()])
  );
  if (Object.keys(values).length === 0) throw new Error("연결 정보를 입력하세요.");
  return saveEncryptedCredential(
    input,
    JSON.stringify(values),
    `•••••• · ${Object.keys(values).length}개 필드`
  );
}

export async function saveVerifiedCredential(input: {
  ownerId: string;
  appId: string;
  label: string;
  values: Record<string, string>;
  accountLabel: string;
  providerAccountId?: string | null;
}) {
  const values = Object.fromEntries(Object.entries(input.values).map(([key, value]) => [key, value.trim()]));
  if (Object.keys(values).length === 0) throw new Error("연결 정보를 입력하세요.");
  const verifiedAt = new Date().toISOString();
  return saveEncryptedCredential(
    input,
    JSON.stringify(values),
    `•••••• · ${Object.keys(values).length}개 필드`,
    {
      accountLabel: input.accountLabel,
      providerAccountId: input.providerAccountId || null,
      verificationStatus: "verified",
      verifiedAt,
      schemaVersion: 2,
    },
  );
}

async function saveEncryptedCredential(
  input: { ownerId: string; appId: string; label: string },
  secret: string,
  masked: string,
  metadata: Pick<AutomationCredential, "accountLabel" | "providerAccountId" | "verificationStatus" | "verifiedAt" | "schemaVersion"> = {},
) {
  const encrypted = encrypt(secret);
  const now = new Date().toISOString();
  const credential: AutomationCredential = {
    id: randomUUID(), appId: input.appId.trim(), label: input.label.trim() || `${input.appId} API`,
    masked, ciphertext: encrypted.ciphertext, iv: encrypted.iv,
    authTag: encrypted.authTag, keyId: encrypted.keyId, ...metadata, createdAt: now, updatedAt: now
  };
  try {
    await mutateDocument(input.ownerId, (document) => { document.credentials.unshift(credential); });
  } catch (error) {
    if (isCredentialPersistenceError(error)) throw error;
    if (process.env.DATABASE_URL?.trim()) {
      throw new CredentialPersistenceError(
        "CREDENTIAL_DATABASE_UNAVAILABLE",
        "검증은 완료됐지만 보안 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.",
        503
      );
    }
    throw new CredentialPersistenceError(
      "CREDENTIAL_WRITE_FAILED",
      "검증은 완료됐지만 연결 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요."
    );
  }
  return toPublicCredential(credential);
}

export async function deleteCredential(ownerId: string, credentialId: string) {
  let deleted = false;
  await mutateDocument(ownerId, (document) => {
    const before = document.credentials.length;
    document.credentials = document.credentials.filter((item) => item.id !== credentialId);
    deleted = document.credentials.length !== before;
  });
  return deleted;
}

export async function revealCredential(ownerId: string, credentialId: string) {
  const credential = (await readDocument(ownerId)).credentials.find((item) => item.id === credentialId);
  return credential ? decrypt(credential) : null;
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const selected = selectEncryptionKey();
  const cipher = createCipheriv("aes-256-gcm", selected.key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: selected.keyId
  };
}

function decrypt(credential: AutomationCredential) {
  let lastError: unknown = null;
  const keyIds = credential.keyId
    ? [credential.keyId]
    : configuredKeyIds(true);
  for (const keyId of keyIds) {
    try {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        selectEncryptionKey(keyId).key,
        Buffer.from(credential.iv, "base64")
      );
      decipher.setAuthTag(Buffer.from(credential.authTag, "base64"));
      return Buffer.concat([
        decipher.update(Buffer.from(credential.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8");
    } catch (error) {
      lastError = error;
    }
  }
  if (isCredentialPersistenceError(lastError)) throw lastError;
  throw new CredentialPersistenceError(
    "CREDENTIAL_WRITE_FAILED",
    "저장된 연결 정보를 복호화하지 못했습니다. 계정을 다시 연결해주세요."
  );
}

function selectEncryptionKey(preferred?: CredentialKeyId) {
  const keyId = preferred || configuredKeyIds(false)[0];
  const material = keyId ? keyMaterial(keyId) : null;
  if (!keyId || !material) {
    throw new CredentialPersistenceError(
      "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED",
      "서버 암호화 키 설정이 필요합니다. 관리자에게 문의해주세요."
    );
  }
  return {
    keyId,
    key: createHash("sha256").update(material).digest()
  };
}

function configuredKeyIds(legacyOrder: boolean): CredentialKeyId[] {
  const ordered: CredentialKeyId[] = legacyOrder
    ? ["automation", "integration", "oauth", "development"]
    : ["automation", "integration", "oauth", "development"];
  return ordered.filter((keyId) => Boolean(keyMaterial(keyId)));
}

function keyMaterial(keyId: CredentialKeyId) {
  if (keyId === "automation") return process.env.AUTOMATION_CREDENTIAL_ENCRYPTION_KEY?.trim() || null;
  if (keyId === "integration") return process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim() || null;
  if (keyId === "oauth") return process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim() || null;
  return process.env.NODE_ENV === "production" ? null : "dreamwish-local-development-only";
}

function maskSecret(value: string) {
  const trimmed = value.trim();
  return trimmed.length < 8 ? "••••••••" : `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}

export async function deleteCredentialsByApp(ownerId: string, appId: string) {
  let deleted = 0;
  await mutateDocument(ownerId, (document) => {
    const before = document.credentials.length;
    document.credentials = document.credentials.filter((item) => item.appId !== appId);
    deleted = before - document.credentials.length;
  });
  return deleted;
}

function toPublicCredential(credential: AutomationCredential): PublicAutomationCredential {
  const { ciphertext: _ciphertext, iv: _iv, authTag: _authTag, ...safe } = credential;
  return safe;
}

async function readDocument(ownerId: string) {
  if (process.env.DATABASE_URL) return readOwnerDocument(ownerId, NAMESPACE, EMPTY_DOCUMENT);
  const db = await readJsonStore<CredentialFallbackDb>("automation-credentials.json", EMPTY_DB);
  return structuredClone(db.owners?.[ownerId] || EMPTY_DOCUMENT);
}

async function mutateDocument(ownerId: string, mutate: (document: CredentialDocument) => void | Promise<void>) {
  if (process.env.DATABASE_URL) { await mutateOwnerDocument(ownerId, NAMESPACE, EMPTY_DOCUMENT, mutate); return; }
  const db = await readJsonStore<CredentialFallbackDb>("automation-credentials.json", EMPTY_DB);
  db.owners ||= {};
  const document = structuredClone(db.owners[ownerId] || EMPTY_DOCUMENT);
  await mutate(document);
  db.owners[ownerId] = document;
  await writeJsonStore("automation-credentials.json", db);
}
