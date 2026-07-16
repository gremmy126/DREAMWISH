import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createCrmDeal,
  deleteCrmDeal,
  listCrmDeals,
  updateCrmDeal
} from "@/src/lib/crm/crm.repository";
import type { DealStage } from "@/src/lib/crm/crm.types";

const STAGES: DealStage[] = ["discovery", "contacted", "proposal", "negotiation", "won", "lost"];

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ deals: await listCrmDeals(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!customerId || !title) {
    return NextResponse.json({ error: "customerId와 title이 필요합니다." }, { status: 400 });
  }
  const deal = await createCrmDeal({
    ownerId: owner.uid,
    customerId,
    title,
    value: typeof body.value === "number" ? body.value : undefined,
    probability: typeof body.probability === "number" ? body.probability : undefined,
    stage: STAGES.includes(body.stage as DealStage) ? (body.stage as DealStage) : undefined,
    expectedCloseAt: typeof body.expectedCloseAt === "string" ? body.expectedCloseAt : null
  });
  if (!deal) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ deal }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const dealId = typeof body.dealId === "string" ? body.dealId : "";
  if (!dealId) return NextResponse.json({ error: "dealId가 필요합니다." }, { status: 400 });
  const patch: Parameters<typeof updateCrmDeal>[2] = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (STAGES.includes(body.stage as DealStage)) patch.stage = body.stage as DealStage;
  if (typeof body.value === "number" && Number.isFinite(body.value)) patch.value = body.value;
  if (typeof body.probability === "number" && Number.isFinite(body.probability)) {
    patch.probability = body.probability;
  }
  if (typeof body.expectedCloseAt === "string" || body.expectedCloseAt === null) {
    patch.expectedCloseAt = (body.expectedCloseAt as string) || null;
  }
  const deal = await updateCrmDeal(owner.uid, dealId, patch);
  if (!deal) return NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ deal });
}

export async function DELETE(request: Request) {
  const owner = await requireOwnerContext(request);
  const dealId = new URL(request.url).searchParams.get("dealId") || "";
  const deleted = await deleteCrmDeal(owner.uid, dealId);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "딜을 찾을 수 없습니다." }, { status: 404 });
}
