import { createHmac, timingSafeEqual } from "node:crypto";
import { getCouponHashSecret, hashCouponCode } from "./coupon-code";
import type { Coupon } from "./coupon.types";

export const PENDING_COUPON_COOKIE = "dreamwish-pending-coupon" as const;
export const PENDING_COUPON_MAX_AGE_SECONDS = 15 * 60;

export function calculateDomesticCouponAmount(
  baseAmount: number,
  coupon: Pick<Coupon, "type" | "value" | "currency"> | null
) {
  const base = Math.max(1, Math.trunc(baseAmount));
  if (!coupon || coupon.type === "access_duration" || !coupon.value) return base;
  if (coupon.type === "percentage_discount") {
    const percent = Math.max(0, Math.min(100, coupon.value));
    return Math.max(1, Math.trunc(base * (100 - percent) / 100));
  }
  if (coupon.currency && coupon.currency.toUpperCase() !== "KRW") return base;
  return Math.max(1, base - Math.max(0, Math.trunc(coupon.value)));
}

export function buildDomesticSubscriptionPricing(
  baseAmount: number,
  coupon: Pick<Coupon, "type" | "value" | "currency" | "duration" | "durationMonths"> | null
) {
  const base = Math.max(1, Math.trunc(baseAmount));
  const initialAmount = calculateDomesticCouponAmount(base, coupon);
  if (!coupon || initialAmount === base || coupon.duration === "once") {
    return {
      initialAmount,
      renewalAmount: base,
      remainingDiscountCycles: 0,
      discountForever: false
    };
  }
  if (coupon.duration === "forever") {
    return {
      initialAmount,
      renewalAmount: initialAmount,
      remainingDiscountCycles: 0,
      discountForever: true
    };
  }
  const totalCycles = Math.max(1, Math.trunc(coupon.durationMonths || 1));
  const remainingDiscountCycles = Math.max(0, totalCycles - 1);
  return {
    initialAmount,
    renewalAmount: remainingDiscountCycles > 0 ? initialAmount : base,
    remainingDiscountCycles,
    discountForever: false
  };
}

export function createPendingCouponCookie(code: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ codeHash: hashCouponCode(code), exp: now + PENDING_COUPON_MAX_AGE_SECONDS * 1000 }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readPendingCouponHash(cookieHeader: string | null, now = Date.now()) {
  const token = readCookie(cookieHeader, PENDING_COUPON_COOKIE);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      codeHash?: unknown;
      exp?: unknown;
    };
    return typeof parsed.codeHash === "string" && parsed.codeHash.length === 64 &&
      typeof parsed.exp === "number" && parsed.exp > now
      ? parsed.codeHash
      : null;
  } catch {
    return null;
  }
}

function sign(payload: string) {
  return createHmac("sha256", getCouponHashSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0 || pair.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(pair.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}
