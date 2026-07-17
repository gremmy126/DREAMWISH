import assert from "node:assert/strict";
import {
  createTotpUri,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode
} from "../src/lib/auth/totp";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCodeHash
} from "../src/lib/auth/recovery-code";

const RFC_6238_SHA1_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const RECOVERY_HASH_KEY = Buffer.alloc(32, 0x52).toString("base64");

test("TOTP generation matches the six-digit form of the RFC 6238 SHA-1 vectors", () => {
  const vectors = [
    { seconds: 59, code: "287082" },
    { seconds: 1_111_111_109, code: "081804" },
    { seconds: 1_111_111_111, code: "050471" },
    { seconds: 1_234_567_890, code: "005924" },
    { seconds: 2_000_000_000, code: "279037" },
    { seconds: 20_000_000_000, code: "353130" }
  ];

  for (const vector of vectors) {
    assert.equal(
      generateTotpCode({ secret: RFC_6238_SHA1_SECRET, nowMs: vector.seconds * 1_000 }),
      vector.code
    );
  }
});

test("TOTP codes contain six digits and change on 30-second boundaries", () => {
  assert.equal(
    generateTotpCode({ secret: RFC_6238_SHA1_SECRET, nowMs: 29_999 }),
    "755224"
  );
  assert.equal(
    generateTotpCode({ secret: RFC_6238_SHA1_SECRET, nowMs: 30_000 }),
    "287082"
  );
});

test("TOTP secrets default to 160 random bits encoded as unpadded RFC 4648 base32", () => {
  const first = generateTotpSecret();
  const second = generateTotpSecret();

  assert.match(first, /^[A-Z2-7]{32}$/u);
  assert.match(second, /^[A-Z2-7]{32}$/u);
  assert.equal(first.includes("="), false);
  assert.notEqual(first, second);
});

test("TOTP rejects noncanonical RFC 4648 base32 secret lengths", () => {
  assert.throws(
    () => generateTotpCode({ secret: "A", nowMs: 0 }),
    /Invalid base32 TOTP secret/u
  );
});

test("TOTP enrollment URI encodes the DREAMWISH issuer and account label", () => {
  assert.equal(
    createTotpUri({
      secret: RFC_6238_SHA1_SECRET,
      email: "alice+security@example.com"
    }),
    "otpauth://totp/DREAMWISH:alice%2Bsecurity%40example.com?secret=" +
      `${RFC_6238_SHA1_SECRET}&issuer=DREAMWISH&algorithm=SHA1&digits=6&period=30`
  );
});

test("TOTP verification accepts codes within one time step of the server clock", () => {
  const nowMs = 90_000;

  for (const acceptedCounter of [2, 3, 4]) {
    const code = generateTotpCode({
      secret: RFC_6238_SHA1_SECRET,
      nowMs: acceptedCounter * 30_000
    });
    assert.deepEqual(
      verifyTotpCode({
        secret: RFC_6238_SHA1_SECRET,
        code,
        nowMs,
        lastAcceptedCounter: null
      }),
      { ok: true, counter: acceptedCounter }
    );
  }
});

test("TOTP verification reports clock drift without accepting a code outside the window", () => {
  const code = generateTotpCode({
    secret: RFC_6238_SHA1_SECRET,
    nowMs: 150_000
  });

  assert.deepEqual(
    verifyTotpCode({
      secret: RFC_6238_SHA1_SECRET,
      code,
      nowMs: 90_000,
      lastAcceptedCounter: null
    }),
    { ok: false, reason: "clock_drift" }
  );
});

test("TOTP verification rejects a matched counter that is not newer than replay state", () => {
  const nowMs = 90_000;
  const code = generateTotpCode({ secret: RFC_6238_SHA1_SECRET, nowMs });

  assert.deepEqual(
    verifyTotpCode({
      secret: RFC_6238_SHA1_SECRET,
      code,
      nowMs,
      lastAcceptedCounter: 3
    }),
    { ok: false, reason: "replayed" }
  );
});

test("TOTP verification rejects malformed codes", () => {
  assert.deepEqual(
    verifyTotpCode({
      secret: RFC_6238_SHA1_SECRET,
      code: "not-a-code",
      nowMs: 90_000,
      lastAcceptedCounter: null
    }),
    { ok: false, reason: "invalid" }
  );
});

test("recovery-code generation returns ten unique uppercase codes in readable groups", () => {
  const codes = generateRecoveryCodes();

  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-F0-9]{4}(?:-[A-F0-9]{4}){3}$/u);
  }
});

test("recovery codes use normalized one-way keyed hashes", () => {
  const code = "ABCD-1234-EF56-7890";
  const hash = hashRecoveryCode({ code, keyMaterial: RECOVERY_HASH_KEY });

  assert.notEqual(hash, code);
  assert.equal(hash.includes("ABCD1234EF567890"), false);
  assert.equal(
    hashRecoveryCode({
      code: "  abcd1234ef567890  ",
      keyMaterial: RECOVERY_HASH_KEY
    }),
    hash
  );
  assert.equal(
    verifyRecoveryCodeHash({
      code: "  abcd-1234-ef56-7890  ",
      keyMaterial: RECOVERY_HASH_KEY,
      hash
    }),
    true
  );
  assert.equal(
    verifyRecoveryCodeHash({
      code: "ABCD-1234-EF56-7891",
      keyMaterial: RECOVERY_HASH_KEY,
      hash
    }),
    false
  );
});
