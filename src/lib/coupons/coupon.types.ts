export type CouponType = "access_duration" | "percentage_discount" | "fixed_discount";
export type CouponDuration = "once" | "months" | "forever";

export type Coupon = {
  id: string;
  name: string;
  codeHash: string;
  codeHint: string;
  type: CouponType;
  value: number | null;
  accessDays: number | null;
  currency: string | null;
  duration: CouponDuration;
  durationMonths: number | null;
  maxRedemptions: number;
  perUserLimit: number;
  redemptionCount: number;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  polarDiscountId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CouponCreateInput = {
  name: string;
  code: string;
  type: CouponType;
  value?: number | null;
  accessDays?: number | null;
  currency?: string | null;
  duration: CouponDuration;
  durationMonths?: number | null;
  maxRedemptions: number;
  perUserLimit: number;
  startsAt: string;
  expiresAt: string;
  polarDiscountId?: string | null;
  createdBy: string;
};

export type CouponRedemption = {
  id: string;
  couponId: string;
  userId: string;
  status: "reserved" | "redeemed" | "void";
  reservedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  voidedAt: string | null;
};

export type AccessGrant = {
  id: string;
  userId: string;
  source: "coupon" | "admin";
  couponId: string | null;
  startsAt: string;
  endsAt: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
};

