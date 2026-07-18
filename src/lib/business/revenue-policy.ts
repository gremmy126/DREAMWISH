import { randomUUID } from "node:crypto";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { ensureRevenueSchema } from "./revenue.schema";

export type RevenueTrustRule = {
  id: string; ownerId: string; platform: "android"; sourceApp: string;
  autoConfirmHighConfidence: boolean; enabled: boolean; acknowledgedAt: string; createdAt: string; updatedAt: string;
};
const FILE = "business-revenue-trust.json";

export async function listRevenueTrustRules(ownerId: string): Promise<RevenueTrustRule[]> {
  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const rows = await getPostgres()`SELECT * FROM revenue_source_trust_rules WHERE owner_id = ${ownerId} ORDER BY source_app`;
    return rows.map(mapRule);
  }
  const db = await readJsonStore<{rules: RevenueTrustRule[]}>(FILE, {rules: []});
  return (db.rules || []).filter(rule => rule.ownerId === ownerId);
}

export async function setRevenueTrustRule(input: { ownerId: string; sourceApp: string; acknowledged: boolean }) {
  if (!input.acknowledged) throw new Error("Trusted-source acknowledgement is required.");
  const sourceApp = normalizePackage(input.sourceApp);
  const now = new Date().toISOString();
  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const rows = await getPostgres()`
      INSERT INTO revenue_source_trust_rules (id, owner_id, platform, source_app, auto_confirm_high_confidence, enabled, acknowledged_at)
      VALUES (${randomUUID()}, ${input.ownerId}, 'android', ${sourceApp}, TRUE, TRUE, ${now})
      ON CONFLICT (owner_id, platform, source_app) DO UPDATE SET auto_confirm_high_confidence = TRUE, enabled = TRUE, acknowledged_at = ${now}, updated_at = NOW()
      RETURNING *
    `;
    return mapRule(rows[0]!);
  }
  return withJsonStoreLock(FILE, async () => {
    const db = await readJsonStore<{rules: RevenueTrustRule[]}>(FILE, {rules: []});
    const previous = (db.rules || []).find(rule => rule.ownerId === input.ownerId && rule.sourceApp === sourceApp);
    const rule: RevenueTrustRule = previous ? {...previous, enabled: true, autoConfirmHighConfidence: true, acknowledgedAt: now, updatedAt: now} : {
      id: randomUUID(), ownerId: input.ownerId, platform: "android", sourceApp, autoConfirmHighConfidence: true, enabled: true, acknowledgedAt: now, createdAt: now, updatedAt: now
    };
    db.rules = [rule, ...(db.rules || []).filter(item => item.id !== rule.id)]; await writeJsonStore(FILE, db); return rule;
  });
}

export async function disableRevenueTrustRule(ownerId: string, sourceApp: string) {
  const normalized = normalizePackage(sourceApp);
  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const rows = await getPostgres()`UPDATE revenue_source_trust_rules SET enabled = FALSE, updated_at = NOW() WHERE owner_id = ${ownerId} AND platform = 'android' AND source_app = ${normalized} RETURNING *`;
    return rows[0] ? mapRule(rows[0]) : null;
  }
  return withJsonStoreLock(FILE, async () => {
    const db = await readJsonStore<{rules: RevenueTrustRule[]}>(FILE, {rules: []});
    const rule = (db.rules || []).find(item => item.ownerId === ownerId && item.sourceApp === normalized);
    if (!rule) return null; rule.enabled = false; rule.updatedAt = new Date().toISOString(); await writeJsonStore(FILE, db); return rule;
  });
}

export async function canAutoConfirmAndroidRevenue(ownerId: string, sourceApp: string, confidence: number, direction: string) {
  if (confidence < 0.9 || direction !== "income") return false;
  const rule = (await listRevenueTrustRules(ownerId)).find(item => item.sourceApp === sourceApp);
  return Boolean(rule?.enabled && rule.autoConfirmHighConfidence);
}

function normalizePackage(value: string) { const normalized = value.trim(); if (!/^[A-Za-z0-9._]{3,200}$/u.test(normalized)) throw new Error("Invalid Android package name."); return normalized; }
function mapRule(row: Record<string, unknown>): RevenueTrustRule { return { id: String(row.id), ownerId: String(row.owner_id), platform: "android", sourceApp: String(row.source_app), autoConfirmHighConfidence: Boolean(row.auto_confirm_high_confidence), enabled: Boolean(row.enabled), acknowledgedAt: new Date(row.acknowledged_at as Date | string).toISOString(), createdAt: new Date(row.created_at as Date | string).toISOString(), updatedAt: new Date(row.updated_at as Date | string).toISOString() }; }
