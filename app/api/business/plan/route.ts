import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createBusinessPlanItem,
  deleteBusinessPlanItem,
  getBusinessPlan,
  updateBusinessPlanItem
} from "@/src/lib/business/business-plan.repository";

const KINDS = new Set(["goal", "risk", "priority"]);

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    return NextResponse.json({ ok: true, data: await getBusinessPlan(owner.uid) });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
    if (!kind || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "kind와 title이 필요합니다." } },
        { status: 400 }
      );
    }
    const item = await createBusinessPlanItem(owner.uid, kind as "goal" | "risk" | "priority", {
      title: body.title,
      targetDate: typeof body.targetDate === "string" ? body.targetDate : null,
      level: typeof body.level === "string" ? body.level : undefined,
      mitigation: typeof body.mitigation === "string" ? body.mitigation : undefined
    });
    return NextResponse.json({ ok: true, data: { item } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const kind = typeof body.kind === "string" && KINDS.has(body.kind) ? body.kind : null;
    const id = typeof body.id === "string" ? body.id : "";
    if (!kind || !id) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "kind와 id가 필요합니다." } },
        { status: 400 }
      );
    }
    const item = await updateBusinessPlanItem(
      owner.uid,
      kind as "goal" | "risk" | "priority",
      id,
      body
    );
    if (!item) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "항목을 찾을 수 없습니다." } },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: { item } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") || "";
    const id = url.searchParams.get("id") || "";
    if (!KINDS.has(kind) || !id) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_REQUEST", message: "kind와 id가 필요합니다." } },
        { status: 400 }
      );
    }
    const deleted = await deleteBusinessPlanItem(
      owner.uid,
      kind as "goal" | "risk" | "priority",
      id
    );
    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: { code: "NOT_FOUND", message: "항목을 찾을 수 없습니다." } },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof OwnerContextError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "요청이 실패했습니다." } },
    { status: 500 }
  );
}
