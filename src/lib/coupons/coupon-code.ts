import { createHmac, randomBytes } from "node:crypto";

export function normalizeCouponCode(value: string) {
  return String(value || "").trim().toUpperCase().replace(/\s+/gu, "");
}

export function assertCouponCode(value: string) {
  const code = normalizeCouponCode(value);
  if (!/^[A-Z0-9-]{3,64}$/u.test(code)) {
    throw new Error("Coupon code must contain 3-64 letters, numbers, or hyphens.");
  }
  return code;
}

export function hashCouponCode(value: string, secret = getCouponHashSecret()) {
  return createHmac("sha256", secret).update(assertCouponCode(value), "utf8").digest("hex");
}

export function generateCouponCode(prefix = "DREAM") {
  const safePrefix = normalizeCouponCode(prefix).replace(/[^A-Z0-9]/gu, "").slice(0, 10) || "DREAM";
  return `${safePrefix}${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function getCouponCodeHint(value: string) {
  const code = assertCouponCode(value);
  return code.length <= 6 ? `${code.slice(0, 2)}…${code.slice(-2)}` : `${code.slice(0, 3)}…${code.slice(-3)}`;
}

export function getCouponHashSecret() {
  const secret = process.env.COUPON_HASH_SECRET?.trim() || "";
  if (secret.length < 32) throw new Error("COUPON_HASH_SECRET must contain at least 32 characters.");
  return secret;
}

