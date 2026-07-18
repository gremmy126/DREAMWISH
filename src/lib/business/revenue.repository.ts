import { randomUUID } from "node:crypto";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { parseRevenueSignal, redactRevenueText, validateRevenueCapture } from "./revenue-parser";
import { insertRevenueAudit as appendRevenueAudit } from "./revenue-audit.repository";
import { revenueTransactionFingerprint, sealRevenueText } from "./revenue-crypto";
import { ensureRevenueSchema } from "./revenue.schema";
import type {
  RevenueCandidate,
  RevenueCandidateStatus,
  RevenueCaptureMethod,
  RevenueClassification,
  RevenuePlatform
} from "./revenue.types";

type RevenueAudit = { id: string; ownerId: string; candidateId: string; action: string; createdAt: string; safeMetadata: Record<string, unknown> };
type RevenueDb = { candidates: RevenueCandidate[]; auditEvents: RevenueAudit[] };
const EMPTY_DB: RevenueDb = { candidates: [], auditEvents: [] };
const FILE_NAME = "business-revenue.json";

export async function createRevenueCandidate(input: {
  ownerId: string;
  eventId: string;
  platform: RevenuePlatform;
  captureMethod: RevenueCaptureMethod;
  sourceApp: string;
  capturedAt: string;
  rawText: string;
  linkedCandidateId?: string | null;
}) {
  validateRevenueCapture(input);
  const redacted = redactRevenueText(input.rawText);
  const parsed = parseRevenueSignal(redacted);
  const fingerprint = revenueTransactionFingerprint(input.ownerId, `${input.sourceApp}\0${input.capturedAt}\0${redacted}`);
  const now = new Date().toISOString();
  const candidate: RevenueCandidate = {
    id: randomUUID(),
    ownerId: input.ownerId,
    eventId: input.eventId,
    transactionFingerprint: fingerprint,
    platform: input.platform,
    captureMethod: input.captureMethod,
    sourceApp: input.sourceApp,
    capturedAt: input.capturedAt,
    encryptedRawText: JSON.stringify(sealRevenueText(input.ownerId, redacted)),
    ...parsed,
    confirmedAmount: null,
    status: "provisional",
    classification: "unknown",
    linkedCandidateId: input.linkedCandidateId || null,
    confirmedAt: null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now
  };

  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const sql = getPostgres();
    const result = await sql.begin(async (transaction) => {
      const existing = await transaction`
        SELECT * FROM revenue_candidates
        WHERE owner_id = ${input.ownerId} AND (event_id = ${input.eventId} OR transaction_fingerprint = ${fingerprint})
        ORDER BY created_at LIMIT 1 FOR UPDATE
      `;
      if (existing[0]) return {candidate: mapRow(existing[0]), inserted: false};
      const rows = await transaction`
        INSERT INTO revenue_candidates (
          id, owner_id, event_id, transaction_fingerprint, platform, capture_method, source_app,
          captured_at, raw_encrypted, amount, confirmed_amount, currency, direction, classification,
          counterparty_hint, confidence, evidence, review_state, linked_candidate_id, created_at, updated_at
        ) VALUES (
          ${candidate.id}, ${candidate.ownerId}, ${candidate.eventId}, ${candidate.transactionFingerprint},
          ${candidate.platform}, ${candidate.captureMethod}, ${candidate.sourceApp}, ${candidate.capturedAt},
          ${transaction.json(JSON.parse(candidate.encryptedRawText) as never)}, ${candidate.amount}, NULL, 'KRW',
          ${candidate.direction}, 'unknown', ${candidate.counterpartyHint}, ${candidate.confidence},
          ${transaction.json(candidate.evidence as never)}, 'provisional', ${candidate.linkedCandidateId}, ${now}, ${now}
        ) RETURNING *
      `;
      const created = mapRow(rows[0]!);
      await appendRevenueAudit(transaction, {
        ownerId: created.ownerId,
        candidateId: created.id,
        action: "candidate.created",
        actorType: input.captureMethod === "billing" ? "billing" : "system",
        safeMetadata: { platform: created.platform, captureMethod: created.captureMethod, sourceApp: created.sourceApp }
      });
      return {candidate: created, inserted: true};
    });
    if (result.inserted && result.candidate.status === "provisional") {
      const { enqueueRevenueReviewNotification } = await import("./revenue-notification.service");
      await enqueueRevenueReviewNotification(result.candidate).catch(() => undefined);
    }
    return result.candidate;
  }

  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const existing = db.candidates.find(item => item.ownerId === input.ownerId && (item.eventId === input.eventId || item.transactionFingerprint === fingerprint));
    if (existing) return existing;
    db.candidates.unshift(candidate);
    db.auditEvents.push(localAudit(candidate, "candidate.created", { platform: candidate.platform, captureMethod: candidate.captureMethod }));
    await writeJsonStore(FILE_NAME, db);
    return candidate;
  });
}

export async function listRevenueCandidates(ownerId: string) {
  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const rows = await getPostgres()`SELECT * FROM revenue_candidates WHERE owner_id = ${ownerId} ORDER BY captured_at DESC, created_at DESC`;
    return rows.map(mapRow);
  }
  return (await readDb()).candidates.filter(item => item.ownerId === ownerId).map(normalizeLegacy);
}

export async function transitionRevenueCandidate(
  ownerId: string,
  id: string,
  status: Exclude<RevenueCandidateStatus, "provisional">,
  confirmedAmount?: number,
  linkedCandidateId?: string | null
) {
  const classification = classificationFor(status);
  if (hasPostgresStorage()) {
    await ensureRevenueSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const current = await transaction`SELECT * FROM revenue_candidates WHERE id = ${id} AND owner_id = ${ownerId} FOR UPDATE`;
      if (!current[0]) return null;
      const amount = status === "confirmed" ? normalizeAmount(confirmedAmount === undefined ? Number(current[0].amount) : confirmedAmount) : null;
      const rows = await transaction`
        UPDATE revenue_candidates SET review_state = ${status}, classification = ${classification},
          confirmed_amount = ${amount}, linked_candidate_id = COALESCE(${linkedCandidateId || null}, linked_candidate_id),
          confirmed_at = CASE WHEN ${status} = 'confirmed' THEN NOW() ELSE NULL END,
          rejected_at = CASE WHEN ${status} IN ('rejected', 'personal', 'duplicate') THEN NOW() ELSE NULL END,
          updated_at = NOW()
        WHERE id = ${id} AND owner_id = ${ownerId} RETURNING *
      `;
      const candidate = mapRow(rows[0]!);
      await appendRevenueAudit(transaction, {
        ownerId,
        candidateId: id,
        action: `candidate.${status}`,
        actorType: "user",
        safeMetadata: { classification, confirmedAmount: amount, linkedCandidateId: linkedCandidateId || null }
      });
      return candidate;
    });
  }

  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const candidate = db.candidates.find(item => item.ownerId === ownerId && item.id === id);
    if (!candidate) return null;
    const now = new Date().toISOString();
    candidate.status = status;
    candidate.classification = classification;
    candidate.updatedAt = now;
    candidate.confirmedAt = status === "confirmed" ? now : null;
    candidate.rejectedAt = ["rejected", "personal", "duplicate"].includes(status) ? now : null;
    candidate.confirmedAmount = status === "confirmed" ? normalizeAmount(confirmedAmount === undefined ? candidate.amount : confirmedAmount) : null;
    candidate.linkedCandidateId = linkedCandidateId || candidate.linkedCandidateId;
    db.auditEvents.push(localAudit(candidate, `candidate.${status}`, { classification, confirmedAmount: candidate.confirmedAmount }));
    await writeJsonStore(FILE_NAME, db);
    return candidate;
  });
}

export async function createConfirmedRevenueFromBilling(input: {
  ownerId: string; eventId: string; provider: string; amount: number; currency: "KRW"; paidAt: string; orderName: string;
}) {
  const candidate = await createRevenueCandidate({
    ownerId: input.ownerId,
    eventId: `billing:${input.eventId}`,
    platform: "web",
    captureMethod: "billing",
    sourceApp: input.provider,
    capturedAt: input.paidAt,
    rawText: `입금 ${input.amount}원 ${input.orderName}`
  });
  if (candidate.status === "confirmed") return candidate;
  return (await transitionRevenueCandidate(input.ownerId, candidate.id, "confirmed", input.amount))!;
}

function classificationFor(status: Exclude<RevenueCandidateStatus, "provisional">): RevenueClassification {
  if (status === "confirmed") return "revenue";
  return status;
}

function mapRow(row: Record<string, unknown>): RevenueCandidate {
  return {
    id: String(row.id), ownerId: String(row.owner_id), eventId: String(row.event_id), transactionFingerprint: String(row.transaction_fingerprint),
    platform: String(row.platform) as RevenuePlatform, captureMethod: String(row.capture_method) as RevenueCaptureMethod,
    sourceApp: String(row.source_app), capturedAt: iso(row.captured_at), encryptedRawText: JSON.stringify(row.raw_encrypted || {}),
    amount: row.amount == null ? null : Number(row.amount), confirmedAmount: row.confirmed_amount == null ? null : Number(row.confirmed_amount), currency: "KRW",
    direction: String(row.direction) as RevenueCandidate["direction"], classification: String(row.classification) as RevenueClassification,
    counterpartyHint: row.counterparty_hint ? String(row.counterparty_hint) : null, confidence: Number(row.confidence),
    evidence: Array.isArray(row.evidence) ? row.evidence.map(String) : [], status: String(row.review_state) as RevenueCandidateStatus,
    linkedCandidateId: row.linked_candidate_id ? String(row.linked_candidate_id) : null,
    confirmedAt: row.confirmed_at ? iso(row.confirmed_at) : null, rejectedAt: row.rejected_at ? iso(row.rejected_at) : null,
    createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
  };
}

async function readDb() {
  const db = await readJsonStore<RevenueDb>(FILE_NAME, EMPTY_DB);
  return { candidates: Array.isArray(db.candidates) ? db.candidates.map(normalizeLegacy) : [], auditEvents: Array.isArray(db.auditEvents) ? db.auditEvents : [] };
}
function normalizeLegacy(candidate: RevenueCandidate): RevenueCandidate {
  return { ...candidate, transactionFingerprint: candidate.transactionFingerprint || revenueTransactionFingerprint(candidate.ownerId, `${candidate.eventId}:${candidate.sourceApp}:${candidate.capturedAt}`), classification: candidate.classification || (candidate.status === "confirmed" ? "revenue" : "unknown"), linkedCandidateId: candidate.linkedCandidateId || null };
}
function localAudit(candidate: RevenueCandidate, action: string, safeMetadata: Record<string, unknown>): RevenueAudit { return { id: randomUUID(), ownerId: candidate.ownerId, candidateId: candidate.id, action, createdAt: new Date().toISOString(), safeMetadata }; }
function normalizeAmount(value: number | null) { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null; }
function iso(value: unknown) { return new Date(value as Date | string).toISOString(); }
