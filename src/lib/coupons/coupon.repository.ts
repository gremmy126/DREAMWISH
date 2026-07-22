import { getPostgres, hasPostgresStorage } from "../db/postgres";
import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import { ensureAdminSchema } from "../admin/schema";
import { getCouponCodeHint, hashCouponCode } from "./coupon-code";
import { CouponConflictError, CouponValidationError } from "./coupon-errors";
import type {
  AccessGrant,
  Coupon,
  CouponCreateInput,
  CouponRedemption
} from "./coupon.types";

type CouponDb = {
  coupons: Coupon[];
  redemptions: CouponRedemption[];
  accessGrants: AccessGrant[];
};

const COUPON_FILE = "coupons.json";
const EMPTY_DB: CouponDb = { coupons: [], redemptions: [], accessGrants: [] };

export async function createCoupon(input: CouponCreateInput): Promise<Coupon> {
  const normalized = validateCreateInput(input);
  const now = new Date().toISOString();
  const coupon: Coupon = {
    id: crypto.randomUUID(),
    name: normalized.name,
    codeHash: hashCouponCode(normalized.code),
    codeHint: getCouponCodeHint(normalized.code),
    type: normalized.type,
    value: normalized.value ?? null,
    accessDays: normalized.accessDays ?? null,
    currency: normalized.currency?.toUpperCase() || null,
    duration: normalized.duration,
    durationMonths: normalized.durationMonths ?? null,
    maxRedemptions: normalized.maxRedemptions,
    perUserLimit: normalized.perUserLimit,
    redemptionCount: 0,
    startsAt: new Date(normalized.startsAt).toISOString(),
    expiresAt: new Date(normalized.expiresAt).toISOString(),
    active: true,
    polarDiscountId: normalized.polarDiscountId || null,
    createdBy: normalized.createdBy,
    createdAt: now,
    updatedAt: now
  };
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const existing = await getPostgres()`SELECT 1 FROM coupon_codes WHERE code_hash = ${coupon.codeHash} LIMIT 1`;
    if (existing[0]) throw new CouponConflictError();
    try {
      await getPostgres()`
        INSERT INTO coupon_codes (
          id, name, code_hash, code_hint, coupon_type, value_amount, access_days,
          currency, duration, duration_months, max_redemptions, per_user_limit,
          redemption_count, starts_at, expires_at, active, polar_discount_id,
          created_by, created_at, updated_at
        ) VALUES (
          ${coupon.id}, ${coupon.name}, ${coupon.codeHash}, ${coupon.codeHint}, ${coupon.type},
          ${coupon.value}, ${coupon.accessDays}, ${coupon.currency}, ${coupon.duration},
          ${coupon.durationMonths}, ${coupon.maxRedemptions}, ${coupon.perUserLimit}, 0,
          ${coupon.startsAt}, ${coupon.expiresAt}, TRUE, ${coupon.polarDiscountId},
          ${coupon.createdBy}, ${coupon.createdAt}, ${coupon.updatedAt}
        )
      `;
    } catch (error) {
      // 동시 삽입으로 유니크 제약을 위반한 경우도 중복(409)으로 취급한다.
      if (/duplicate|unique/iu.test(error instanceof Error ? error.message : "")) {
        throw new CouponConflictError();
      }
      throw error;
    }
    return coupon;
  }
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    if (db.coupons.some((item) => item.codeHash === coupon.codeHash)) {
      throw new CouponConflictError();
    }
    db.coupons.unshift(coupon);
    await writeJsonStore(COUPON_FILE, db);
    return coupon;
  });
}

export async function listCoupons(limit = 200) {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`SELECT * FROM coupon_codes ORDER BY created_at DESC LIMIT ${safeLimit}`;
    return rows.map(mapCouponRow);
  }
  return (await readDb()).coupons.slice(0, safeLimit);
}

export async function setCouponActive(couponId: string, active: boolean) {
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      UPDATE coupon_codes SET active = ${active}, updated_at = NOW()
      WHERE id = ${couponId} RETURNING *
    `;
    if (!rows[0]) throw new Error("Coupon not found.");
    return mapCouponRow(rows[0]);
  }
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    const coupon = db.coupons.find((item) => item.id === couponId);
    if (!coupon) throw new Error("Coupon not found.");
    const updated = { ...coupon, active, updatedAt: new Date().toISOString() };
    db.coupons = db.coupons.map((item) => item.id === couponId ? updated : item);
    await writeJsonStore(COUPON_FILE, db);
    return updated;
  });
}

export async function redeemCouponByCode(input: { code: string; userId: string }) {
  return redeemCouponByHash({ codeHash: hashCouponCode(input.code), userId: input.userId });
}

export async function redeemCouponByHash(input: { codeHash: string; userId: string }): Promise<{
  coupon: Coupon;
  redemption: CouponRedemption;
  accessGrant: AccessGrant | null;
}> {
  if (!input.userId.trim()) throw new Error("Authenticated user is required.");
  if (hasPostgresStorage()) return redeemPostgres(input);
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    const coupon = db.coupons.find((item) => item.codeHash === input.codeHash);
    assertRedeemable(coupon, db.redemptions, input.userId);
    const now = new Date();
    const redemption: CouponRedemption = {
      id: crypto.randomUUID(),
      couponId: coupon.id,
      userId: input.userId,
      status: coupon.type === "access_duration" ? "redeemed" : "reserved",
      reservedAt: now.toISOString(),
      expiresAt: coupon.type === "access_duration" ? null : new Date(now.getTime() + 30 * 60_000).toISOString(),
      redeemedAt: coupon.type === "access_duration" ? now.toISOString() : null,
      voidedAt: null
    };
    let accessGrant: AccessGrant | null = null;
    if (coupon.type === "access_duration") {
      accessGrant = buildAccessGrant({
        userId: input.userId,
        source: "coupon",
        couponId: coupon.id,
        days: coupon.accessDays || 0,
        existing: activeGrantFrom(db.accessGrants, input.userId),
        now
      });
      db.accessGrants.unshift(accessGrant);
    }
    db.redemptions.unshift(redemption);
    db.coupons = db.coupons.map((item) => item.id === coupon.id
      ? { ...item, redemptionCount: item.redemptionCount + 1, updatedAt: now.toISOString() }
      : item);
    await writeJsonStore(COUPON_FILE, db);
    return { coupon: { ...coupon, redemptionCount: coupon.redemptionCount + 1 }, redemption, accessGrant };
  });
}

export async function getActiveAccessGrant(userId: string): Promise<AccessGrant | null> {
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT * FROM access_grants
      WHERE user_id = ${userId} AND status = 'active' AND starts_at <= NOW() AND ends_at > NOW()
      ORDER BY ends_at DESC LIMIT 1
    `;
    return rows[0] ? mapGrantRow(rows[0]) : null;
  }
  return activeGrantFrom((await readDb()).accessGrants, userId);
}

export async function listAccessGrants(userId: string) {
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`SELECT * FROM access_grants WHERE user_id = ${userId} ORDER BY created_at DESC`;
    return rows.map(mapGrantRow);
  }
  return (await readDb()).accessGrants.filter((item) => item.userId === userId);
}

// 관리자 대시보드용: 사용자와 무관하게 최근 발급된 이용권(접근권한)을 모은다.
export async function listAllAccessGrants(limit = 100): Promise<AccessGrant[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`SELECT * FROM access_grants ORDER BY created_at DESC LIMIT ${safeLimit}`;
    return rows.map(mapGrantRow);
  }
  // JSON 저장소는 신규 항목을 앞에 넣으므로 앞에서부터 잘라 최신순을 유지한다.
  return (await readDb()).accessGrants.slice(0, safeLimit);
}

export async function grantAccess(input: { userId: string; days: number; source?: "admin" | "coupon"; couponId?: string | null }) {
  const days = Math.max(1, Math.min(3650, Math.trunc(input.days)));
  const now = new Date();
  const existing = await getActiveAccessGrant(input.userId);
  const grant = buildAccessGrant({ userId: input.userId, source: input.source || "admin", couponId: input.couponId || null, days, existing, now });
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    await getPostgres()`INSERT INTO access_grants (id, user_id, source, coupon_id, starts_at, ends_at, status, created_at) VALUES (${grant.id}, ${grant.userId}, ${grant.source}, ${grant.couponId}, ${grant.startsAt}, ${grant.endsAt}, 'active', ${grant.createdAt})`;
    return grant;
  }
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    db.accessGrants.unshift(grant);
    await writeJsonStore(COUPON_FILE, db);
    return grant;
  });
}

export async function revokeAccessGrant(grantId: string, userId: string) {
  const revokedAt = new Date().toISOString();
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`UPDATE access_grants SET status = 'revoked', revoked_at = ${revokedAt} WHERE id = ${grantId} AND user_id = ${userId} RETURNING *`;
    if (!rows[0]) throw new Error("Access grant not found.");
    return mapGrantRow(rows[0]);
  }
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    const grant = db.accessGrants.find((item) => item.id === grantId && item.userId === userId);
    if (!grant) throw new Error("Access grant not found.");
    const updated: AccessGrant = { ...grant, status: "revoked", revokedAt };
    db.accessGrants = db.accessGrants.map((item) => item.id === grantId ? updated : item);
    await writeJsonStore(COUPON_FILE, db);
    return updated;
  });
}

export async function getPreparedDiscount(userId: string) {
  const now = new Date();
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT r.*, row_to_json(c.*) AS coupon
      FROM coupon_redemptions r JOIN coupon_codes c ON c.id = r.coupon_id
      WHERE r.user_id = ${userId} AND r.status = 'reserved' AND r.expires_at > NOW()
        AND c.active = TRUE AND c.polar_discount_id IS NOT NULL
      ORDER BY r.reserved_at DESC LIMIT 1
    `;
    return rows[0] ? { redemption: mapRedemptionRow(rows[0]), coupon: mapCouponRow(rows[0].coupon as Record<string, unknown>) } : null;
  }
  const db = await readDb();
  const redemption = db.redemptions.find((item) => item.userId === userId && item.status === "reserved" && Boolean(item.expiresAt) && new Date(item.expiresAt!).getTime() > now.getTime());
  const coupon = redemption ? db.coupons.find((item) => item.id === redemption.couponId && item.active && item.polarDiscountId) : null;
  return redemption && coupon ? { redemption, coupon } : null;
}

export async function getPreparedDomesticDiscount(userId: string) {
  const now = new Date();
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT r.*, row_to_json(c.*) AS coupon
      FROM coupon_redemptions r JOIN coupon_codes c ON c.id = r.coupon_id
      WHERE r.user_id = ${userId} AND r.status = 'reserved' AND r.expires_at > NOW()
        AND c.active = TRUE AND c.coupon_type IN ('percentage_discount', 'fixed_discount')
      ORDER BY r.reserved_at DESC LIMIT 1
    `;
    return rows[0]
      ? { redemption: mapRedemptionRow(rows[0]), coupon: mapCouponRow(rows[0].coupon as Record<string, unknown>) }
      : null;
  }
  const db = await readDb();
  const redemption = db.redemptions.find((item) =>
    item.userId === userId && item.status === "reserved" && Boolean(item.expiresAt) &&
    new Date(item.expiresAt!).getTime() > now.getTime()
  );
  const coupon = redemption
    ? db.coupons.find((item) => item.id === redemption.couponId && item.active && item.type !== "access_duration")
    : null;
  return redemption && coupon ? { redemption, coupon } : null;
}

export async function markPreparedDiscountRedeemed(userId: string) {
  return updatePreparedDiscount(userId, "redeemed");
}

export async function voidPreparedDiscount(userId: string) {
  return updatePreparedDiscount(userId, "void");
}

async function updatePreparedDiscount(userId: string, status: "redeemed" | "void") {
  const now = new Date().toISOString();
  if (hasPostgresStorage()) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      UPDATE coupon_redemptions SET status = ${status},
        redeemed_at = CASE WHEN ${status} = 'redeemed' THEN ${now} ELSE redeemed_at END,
        voided_at = CASE WHEN ${status} = 'void' THEN ${now} ELSE voided_at END
      WHERE id = (SELECT id FROM coupon_redemptions WHERE user_id = ${userId} AND status = 'reserved' ORDER BY reserved_at DESC LIMIT 1)
      RETURNING *
    `;
    return rows[0] ? mapRedemptionRow(rows[0]) : null;
  }
  return withJsonStoreLock(COUPON_FILE, async () => {
    const db = await readDb();
    const redemption = db.redemptions.find((item) => item.userId === userId && item.status === "reserved");
    if (!redemption) return null;
    const updated: CouponRedemption = { ...redemption, status, redeemedAt: status === "redeemed" ? now : redemption.redeemedAt, voidedAt: status === "void" ? now : redemption.voidedAt };
    db.redemptions = db.redemptions.map((item) => item.id === updated.id ? updated : item);
    await writeJsonStore(COUPON_FILE, db);
    return updated;
  });
}

async function redeemPostgres(input: { codeHash: string; userId: string }) {
  await ensureAdminSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const rows = await transaction`SELECT * FROM coupon_codes WHERE code_hash = ${input.codeHash} FOR UPDATE`;
    const coupon = rows[0] ? mapCouponRow(rows[0]) : undefined;
    const existingRows = coupon ? await transaction`SELECT * FROM coupon_redemptions WHERE coupon_id = ${coupon.id} AND user_id = ${input.userId} AND status <> 'void'` : [];
    assertRedeemable(coupon, existingRows.map(mapRedemptionRow), input.userId);
    const now = new Date();
    const redemption: CouponRedemption = { id: crypto.randomUUID(), couponId: coupon.id, userId: input.userId, status: coupon.type === "access_duration" ? "redeemed" : "reserved", reservedAt: now.toISOString(), expiresAt: coupon.type === "access_duration" ? null : new Date(now.getTime() + 30 * 60_000).toISOString(), redeemedAt: coupon.type === "access_duration" ? now.toISOString() : null, voidedAt: null };
    await transaction`INSERT INTO coupon_redemptions (id, coupon_id, user_id, status, reserved_at, expires_at, redeemed_at) VALUES (${redemption.id}, ${redemption.couponId}, ${redemption.userId}, ${redemption.status}, ${redemption.reservedAt}, ${redemption.expiresAt}, ${redemption.redeemedAt})`;
    let accessGrant: AccessGrant | null = null;
    if (coupon.type === "access_duration") {
      const grantRows = await transaction`SELECT * FROM access_grants WHERE user_id = ${input.userId} AND status = 'active' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 1 FOR UPDATE`;
      accessGrant = buildAccessGrant({ userId: input.userId, source: "coupon", couponId: coupon.id, days: coupon.accessDays || 0, existing: grantRows[0] ? mapGrantRow(grantRows[0]) : null, now });
      await transaction`INSERT INTO access_grants (id, user_id, source, coupon_id, starts_at, ends_at, status, created_at) VALUES (${accessGrant.id}, ${accessGrant.userId}, ${accessGrant.source}, ${accessGrant.couponId}, ${accessGrant.startsAt}, ${accessGrant.endsAt}, 'active', ${accessGrant.createdAt})`;
    }
    await transaction`UPDATE coupon_codes SET redemption_count = redemption_count + 1, updated_at = NOW() WHERE id = ${coupon.id}`;
    return { coupon: { ...coupon, redemptionCount: coupon.redemptionCount + 1 }, redemption, accessGrant };
  });
}

function assertRedeemable(coupon: Coupon | undefined, redemptions: CouponRedemption[], userId: string): asserts coupon is Coupon {
  if (!coupon || !coupon.active) throw new Error("Coupon is invalid or inactive.");
  const now = Date.now();
  if (new Date(coupon.startsAt).getTime() > now || new Date(coupon.expiresAt).getTime() <= now) throw new Error("Coupon is not currently redeemable.");
  if (coupon.redemptionCount >= coupon.maxRedemptions) throw new Error("Coupon redemption limit has been reached.");
  const count = redemptions.filter((item) => item.userId === userId && item.status !== "void").length;
  if (count >= coupon.perUserLimit) throw new Error("Coupon was already used by this account.");
}

function buildAccessGrant(input: { userId: string; source: "coupon" | "admin"; couponId: string | null; days: number; existing: AccessGrant | null; now: Date }): AccessGrant {
  const base = input.existing && new Date(input.existing.endsAt).getTime() > input.now.getTime() ? new Date(input.existing.endsAt) : input.now;
  return { id: crypto.randomUUID(), userId: input.userId, source: input.source, couponId: input.couponId, startsAt: input.now.toISOString(), endsAt: new Date(base.getTime() + input.days * 86_400_000).toISOString(), status: "active", createdAt: input.now.toISOString(), revokedAt: null };
}

function activeGrantFrom(grants: AccessGrant[], userId: string) {
  const now = Date.now();
  return grants.filter((item) => item.userId === userId && item.status === "active" && new Date(item.startsAt).getTime() <= now && new Date(item.endsAt).getTime() > now).sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0] || null;
}

function validateCreateInput(input: CouponCreateInput) {
  const name = input.name.trim();
  if (!name) throw new CouponValidationError("쿠폰 이름을 입력해 주세요.");
  if (!Number.isInteger(input.maxRedemptions) || input.maxRedemptions < 1) throw new CouponValidationError("전체 사용 한도는 1 이상이어야 합니다.");
  if (!Number.isInteger(input.perUserLimit) || input.perUserLimit < 1) throw new CouponValidationError("사용자별 사용 한도는 1 이상이어야 합니다.");
  if (new Date(input.expiresAt).getTime() <= new Date(input.startsAt).getTime()) throw new CouponValidationError("만료일은 시작일보다 뒤여야 합니다.");
  if (input.type === "access_duration" && (!Number.isInteger(input.accessDays) || Number(input.accessDays) < 1)) throw new CouponValidationError("이용권형 쿠폰은 이용 기간(일)이 필요합니다.");
  if (input.type === "percentage_discount" && (!Number.isInteger(input.value) || Number(input.value) < 1 || Number(input.value) > 100)) throw new CouponValidationError("정률 할인율은 1% 이상 100% 이하여야 합니다.");
  if (input.type === "fixed_discount" && (!Number.isInteger(input.value) || Number(input.value) < 1)) throw new CouponValidationError("정액 할인 금액은 1 이상이어야 합니다.");
  return { ...input, name };
}

async function readDb(): Promise<CouponDb> {
  const db = await readJsonStore<CouponDb>(COUPON_FILE, EMPTY_DB);
  return { coupons: Array.isArray(db.coupons) ? db.coupons : [], redemptions: Array.isArray(db.redemptions) ? db.redemptions : [], accessGrants: Array.isArray(db.accessGrants) ? db.accessGrants : [] };
}

function mapCouponRow(row: Record<string, unknown>): Coupon {
  return { id: String(row.id), name: String(row.name), codeHash: String(row.code_hash), codeHint: String(row.code_hint), type: String(row.coupon_type) as Coupon["type"], value: row.value_amount == null ? null : Number(row.value_amount), accessDays: row.access_days == null ? null : Number(row.access_days), currency: row.currency == null ? null : String(row.currency), duration: String(row.duration) as Coupon["duration"], durationMonths: row.duration_months == null ? null : Number(row.duration_months), maxRedemptions: Number(row.max_redemptions), perUserLimit: Number(row.per_user_limit), redemptionCount: Number(row.redemption_count), startsAt: toIso(row.starts_at), expiresAt: toIso(row.expires_at), active: Boolean(row.active), polarDiscountId: row.polar_discount_id == null ? null : String(row.polar_discount_id), createdBy: String(row.created_by), createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) };
}

function mapRedemptionRow(row: Record<string, unknown>): CouponRedemption {
  return { id: String(row.id), couponId: String(row.coupon_id), userId: String(row.user_id), status: String(row.status) as CouponRedemption["status"], reservedAt: toIso(row.reserved_at), expiresAt: row.expires_at ? toIso(row.expires_at) : null, redeemedAt: row.redeemed_at ? toIso(row.redeemed_at) : null, voidedAt: row.voided_at ? toIso(row.voided_at) : null };
}

function mapGrantRow(row: Record<string, unknown>): AccessGrant {
  return { id: String(row.id), userId: String(row.user_id), source: String(row.source) as AccessGrant["source"], couponId: row.coupon_id ? String(row.coupon_id) : null, startsAt: toIso(row.starts_at), endsAt: toIso(row.ends_at), status: String(row.status) as AccessGrant["status"], createdAt: toIso(row.created_at), revokedAt: row.revoked_at ? toIso(row.revoked_at) : null };
}

function toIso(value: unknown) { return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString(); }
