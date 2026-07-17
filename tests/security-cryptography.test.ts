import assert from "node:assert/strict";
import { openField, sealField } from "../src/lib/security/aes-gcm-field";
import { keyedDigest, safeDigestEqual } from "../src/lib/security/keyed-digest";

const HEX_KEY = Buffer.alloc(32, 0x31).toString("hex");
const BASE64_KEY = Buffer.alloc(32, 0x42).toString("base64");

test("AES-GCM seals plaintext in an authenticated versioned field", () => {
  const plaintext = "otpauth-secret-JBSWY3DPEHPK3PXP";
  const field = sealField({
    plaintext,
    keyMaterial: HEX_KEY,
    purpose: "totp-factor"
  });

  assert.equal(field.version, 1);
  assert.equal(field.algorithm, "aes-256-gcm");
  assert.doesNotMatch(JSON.stringify(field), new RegExp(plaintext, "u"));
  assert.equal(
    openField({ field, keyMaterial: HEX_KEY, purpose: "totp-factor" }),
    plaintext
  );
});

test("AES-GCM opens fields created from base64 key material", () => {
  const field = sealField({
    plaintext: "paired-device-secret",
    keyMaterial: BASE64_KEY,
    purpose: "device-pairing"
  });

  assert.equal(
    openField({ field, keyMaterial: BASE64_KEY, purpose: "device-pairing" }),
    "paired-device-secret"
  );
});

test("AES-GCM rejects an altered authentication tag", () => {
  const field = sealField({
    plaintext: "sensitive-revenue-payload",
    keyMaterial: HEX_KEY,
    purpose: "revenue-import"
  });
  const alteredTag = Buffer.from(field.authTag, "base64");
  alteredTag[0] ^= 0xff;

  assert.throws(() =>
    openField({
      field: { ...field, authTag: alteredTag.toString("base64") },
      keyMaterial: HEX_KEY,
      purpose: "revenue-import"
    })
  );
});

test("AES-GCM purpose binding prevents cross-purpose decryption", () => {
  const field = sealField({
    plaintext: "purpose-bound-secret",
    keyMaterial: HEX_KEY,
    purpose: "totp-factor"
  });

  assert.throws(() =>
    openField({ field, keyMaterial: HEX_KEY, purpose: "revenue-import" })
  );
});

test("keyed digests compare deterministically without retaining the token", () => {
  const token = "single-use-pairing-token";
  const digest = keyedDigest(token, BASE64_KEY, "device-pairing-token");
  const sameDigest = keyedDigest(token, BASE64_KEY, "device-pairing-token");
  const otherDigest = keyedDigest("another-token", BASE64_KEY, "device-pairing-token");
  const otherPurpose = keyedDigest(token, BASE64_KEY, "mfa-challenge");

  assert.notEqual(digest, token);
  assert.equal(digest.includes(token), false);
  assert.equal(safeDigestEqual(digest, sameDigest), true);
  assert.equal(safeDigestEqual(digest, otherDigest), false);
  assert.equal(safeDigestEqual(digest, otherPurpose), false);
  assert.equal(safeDigestEqual(digest, `${digest}x`), false);
});

test("production cryptography rejects key material shorter than 32 bytes", () => {
  const previousEnvironment = process.env;
  process.env = { ...process.env, NODE_ENV: "production" };
  try {
    assert.throws(
      () => sealField({ plaintext: "secret", keyMaterial: "c2hvcnQ=", purpose: "test" }),
      /at least 32 bytes/u
    );
    assert.throws(
      () => keyedDigest("token", "c2hvcnQ=", "test"),
      /at least 32 bytes/u
    );
  } finally {
    process.env = previousEnvironment;
  }
});
