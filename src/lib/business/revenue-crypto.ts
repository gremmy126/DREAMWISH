import { createHmac } from "node:crypto";
import { sealField, type AesGcmField } from "../security/aes-gcm-field";

export function sealRevenueText(ownerId: string, plaintext: string) {
  return sealField({ plaintext, keyMaterial: revenueKey(), purpose: `revenue-raw-v1:${ownerId}` });
}

export function revenueTransactionFingerprint(ownerId: string, value: string) {
  return createHmac("sha256", revenueKey()).update(`revenue-fingerprint-v1\0${ownerId}\0${normalize(value)}`).digest("hex");
}

export function serializeRevenueField(field: AesGcmField) { return field; }

function revenueKey() {
  const configured = process.env.REVENUE_DATA_ENCRYPTION_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("REVENUE_DATA_ENCRYPTION_KEY is required in production.");
  return Buffer.from("dreamwish-local-revenue-encryption-key-v1", "utf8").toString("base64");
}

function normalize(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim(); }
