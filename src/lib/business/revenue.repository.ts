import { encryptToken } from "../oauth/token-encryption";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { parseRevenueSignal, redactRevenueText, validateRevenueCapture } from "./revenue-parser";
import type {
  RevenueCandidate,
  RevenueCandidateStatus,
  RevenueCaptureMethod,
  RevenuePlatform
} from "./revenue.types";

type RevenueDb = { candidates: RevenueCandidate[] };
const EMPTY_DB: RevenueDb = { candidates: [] };
const FILE_NAME = "business-revenue.json";

export async function createRevenueCandidate(input: {
  ownerId: string;
  eventId: string;
  platform: RevenuePlatform;
  captureMethod: RevenueCaptureMethod;
  sourceApp: string;
  capturedAt: string;
  rawText: string;
}) {
  validateRevenueCapture(input);
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const existing = db.candidates.find(
      (item) => item.ownerId === input.ownerId && item.eventId === input.eventId
    );
    if (existing) return existing;

    const parsed = parseRevenueSignal(input.rawText);
    const now = new Date().toISOString();
    const candidate: RevenueCandidate = {
      id: `revenue_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ownerId: input.ownerId,
      eventId: input.eventId,
      platform: input.platform,
      captureMethod: input.captureMethod,
      sourceApp: input.sourceApp,
      capturedAt: input.capturedAt,
      encryptedRawText: encryptToken(redactRevenueText(input.rawText)),
      ...parsed,
      confirmedAmount: null,
      status: "provisional",
      confirmedAt: null,
      rejectedAt: null,
      createdAt: now,
      updatedAt: now
    };
    db.candidates.unshift(candidate);
    await writeJsonStore(FILE_NAME, db);
    return candidate;
  });
}

export async function listRevenueCandidates(ownerId: string) {
  return (await readDb()).candidates.filter((item) => item.ownerId === ownerId);
}

export async function transitionRevenueCandidate(
  ownerId: string,
  id: string,
  status: Extract<RevenueCandidateStatus, "confirmed" | "rejected">,
  confirmedAmount?: number
) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const candidate = db.candidates.find(
      (item) => item.ownerId === ownerId && item.id === id
    );
    if (!candidate) return null;
    const now = new Date().toISOString();
    candidate.status = status;
    candidate.updatedAt = now;
    candidate.confirmedAt = status === "confirmed" ? now : null;
    candidate.rejectedAt = status === "rejected" ? now : null;
    candidate.confirmedAmount =
      status === "confirmed"
        ? normalizeAmount(confirmedAmount === undefined ? candidate.amount : confirmedAmount)
        : null;
    await writeJsonStore(FILE_NAME, db);
    return candidate;
  });
}

async function readDb() {
  const db = await readJsonStore<RevenueDb>(FILE_NAME, EMPTY_DB);
  return { candidates: Array.isArray(db.candidates) ? db.candidates : [] };
}

function normalizeAmount(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : null;
}
