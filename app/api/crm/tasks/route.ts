import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createCrmTask,
  deleteCrmTask,
  listCrmTasks,
  updateCrmTask
} from "@/src/lib/crm/crm.repository";
import type { CustomerImportance } from "@/src/lib/crm/crm.types";

const PRIORITIES: CustomerImportance[] = ["low", "medium", "high", "critical"];

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ tasks: await listCrmTasks(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!customerId || !title) {
    return NextResponse.json({ error: "customerId와 title이 필요합니다." }, { status: 400 });
  }
  const task = await createCrmTask({
    ownerId: owner.uid,
    customerId,
    title,
    dueAt: typeof body.dueAt === "string" ? body.dueAt : null,
    priority: PRIORITIES.includes(body.priority as CustomerImportance)
      ? (body.priority as CustomerImportance)
      : undefined
  });
  if (!task) return NextResponse.json({ error: "고객을 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ task }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  if (!taskId) return NextResponse.json({ error: "taskId가 필요합니다." }, { status: 400 });
  const task = await updateCrmTask(owner.uid, taskId, {
    completed: typeof body.completed === "boolean" ? body.completed : undefined,
    title: typeof body.title === "string" ? body.title : undefined,
    dueAt: typeof body.dueAt === "string" ? body.dueAt : undefined,
    priority: PRIORITIES.includes(body.priority as CustomerImportance)
      ? (body.priority as CustomerImportance)
      : undefined
  });
  if (!task) return NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ task });
}

export async function DELETE(request: Request) {
  const owner = await requireOwnerContext(request);
  const taskId = new URL(request.url).searchParams.get("taskId") || "";
  const deleted = await deleteCrmTask(owner.uid, taskId);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "업무를 찾을 수 없습니다." }, { status: 404 });
}
