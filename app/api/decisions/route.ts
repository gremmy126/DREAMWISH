import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createDecision,
  listDecisions
} from "@/src/lib/decisions/decision.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const decisions = await listDecisions(owner.uid);
  return NextResponse.json({ decisions });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    objective?: string;
    problem?: Record<string, unknown>;
  };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "결정 제목을 입력하세요." }, { status: 400 });
  }
  const decision = await createDecision(owner.uid, {
    title: body.title,
    objective: body.objective,
    problem: body.problem as never
  });
  return NextResponse.json({ decision }, { status: 201 });
}
