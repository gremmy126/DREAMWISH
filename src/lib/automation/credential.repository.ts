import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mutateOwnerDocument, readOwnerDocument } from "@/src/lib/db/owner-document-store";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type AutomationCredential = {
  id: string;
  appId: string;
  label: string;
  masked: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  accountLabel?: string | null;
  providerAccountId?: string | null;
  verificationStatus?: "verified" | "needs_reconnect";
  verifiedAt?: string | null;
  schemaVersion?: number;
  createdAt: string;
  updatedAt: string;
};

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
    authTag: encrypted.authTag, ...metadata, createdAt: now, updatedAt: now
  };
  await mutateDocument(input.ownerId, (document) => { document.credentials.unshift(credential); });
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
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

function decrypt(credential: AutomationCredential) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(credential.iv, "base64"));
  decipher.setAuthTag(Buffer.from(credential.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(credential.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

function encryptionKey() {
  const configured = process.env.AUTOMATION_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("AUTOMATION_CREDENTIAL_ENCRYPTION_KEY is required.");
  return createHash("sha256").update(configured || "dreamwish-local-development-only").digest();
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
