import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createRevenueCandidate,
  listRevenueCandidates,
  transitionRevenueCandidate
} from "@/src/lib/business/revenue.repository";
import type {
  RevenueCandidateStatus,
  RevenueCaptureMethod,
  RevenuePlatform
} from "@/src/lib/business/revenue.types";
import { importBillingRevenueForOwner } from "@/src/lib/business/billing-revenue-import.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const PLATFORMS: RevenuePlatform[] = ["android", "ios", "web"];
const METHODS: RevenueCaptureMethod[] = [
  "notification_listener",
  "share_extension",
  "manual",
  "gmail",
  "csv"
];

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  await importBillingRevenueForOwner(owner.uid);
  return NextResponse.json({ candidates: await listRevenueCandidates(owner.uid) });
}

export async function POST(request: Request) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const platform = body.platform as RevenuePlatform;
  const captureMethod = body.captureMethod as RevenueCaptureMethod;
  const rawText = clean(body.rawText, 4000);
  if (!PLATFORMS.includes(platform) || !METHODS.includes(captureMethod) || !rawText) {
    return NextResponse.json({ error: "Valid platform, captureMethod and rawText are required." }, { status: 400 });
  }

  try {
    const candidate = await createRevenueCandidate({
      ownerId: owner.uid,
      eventId: clean(body.eventId, 160) || `manual_${Date.now()}`,
      platform,
      captureMethod,
      sourceApp: clean(body.sourceApp, 200) || "manual",
      capturedAt: validDate(body.capturedAt) || new Date().toISOString(),
      rawText
    });
    return NextResponse.json({ candidate }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Revenue signal was rejected." },
      { status: 400 }
    );
  }
}

export async function PATCH(request: Request) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    status?: RevenueCandidateStatus;
    confirmedAmount?: unknown;
    linkedCandidateId?: unknown;
  };
  const id = clean(body.id, 160);
  const status = body.status;
  if (!id || !isFinalStatus(status)) {
    return NextResponse.json({ error: "Candidate id and final status are required." }, { status: 400 });
  }
  const confirmedAmount =
    typeof body.confirmedAmount === "number" && Number.isFinite(body.confirmedAmount)
      ? body.confirmedAmount
      : undefined;
  const candidate = await transitionRevenueCandidate(
    owner.uid,
    id,
    status,
    confirmedAmount,
    clean(body.linkedCandidateId, 160) || null
  );
  return candidate
    ? NextResponse.json({ candidate })
    : NextResponse.json({ error: "Revenue candidate not found." }, { status: 404 });
}

function isFinalStatus(value: RevenueCandidateStatus | undefined): value is Exclude<RevenueCandidateStatus, "provisional"> {
  return value !== undefined && ["confirmed", "expense", "personal", "duplicate", "rejected"].includes(value);
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
