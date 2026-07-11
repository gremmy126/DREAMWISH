import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  addCrmActivity,
  createCustomerDraft,
  listCrmActivities,
  listCrmDeals,
  listCrmTasks,
  listCustomers,
  softDeleteCustomer,
  updateCustomer
} from "@/src/lib/crm/crm.repository";
import type { CrmActivity, CustomerImportance, CustomerStatus } from "@/src/lib/crm/crm.types";
import { buildCustomerInsight } from "@/src/lib/crm/crm-workspace";

const STATUSES: CustomerStatus[] = ["lead", "active", "paused", "inactive"];
const IMPORTANCE: CustomerImportance[] = ["low", "medium", "high", "critical"];

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const query = new URL(request.url).searchParams.get("q") || "";
  const customers = await listCustomers(owner.uid, { query });
  const activities = await listCrmActivities(owner.uid);
  return NextResponse.json({
    customers,
    activities,
    tasks: await listCrmTasks(owner.uid),
    deals: await listCrmDeals(owner.uid),
    insights: customers.map((customer) => buildCustomerInsight(customer, activities))
  });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clean(body.name, 120);
  const email = clean(body.email, 254);
  if (!name) return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    return NextResponse.json({ error: "Email format is invalid" }, { status: 400 });
  }
  const customer = await createCustomerDraft({
    ownerId: owner.uid,
    name,
    email,
    phone: clean(body.phone, 40),
    companyName: clean(body.companyName, 120),
    position: clean(body.position, 120),
    memo: clean(body.memo, 4000)
  });
  return NextResponse.json({ customer }, { status: 201 });
}

export async function PATCH(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    customerId?: unknown;
    status?: unknown;
    importance?: unknown;
    nextContactAt?: unknown;
    expectedValue?: unknown;
    activity?: Partial<Pick<CrmActivity, "type" | "title" | "body">>;
  };
  const customerId = clean(body.customerId, 100);
  if (!customerId) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  const patch: Parameters<typeof updateCustomer>[2] = {};
  if (typeof body.status === "string" && STATUSES.includes(body.status as CustomerStatus)) patch.status = body.status as CustomerStatus;
  if (typeof body.importance === "string" && IMPORTANCE.includes(body.importance as CustomerImportance)) patch.importance = body.importance as CustomerImportance;
  if (typeof body.nextContactAt === "string") patch.nextContactAt = body.nextContactAt || null;
  if (typeof body.expectedValue === "number" && Number.isFinite(body.expectedValue)) patch.expectedValue = Math.max(0, body.expectedValue);
  const customer = await updateCustomer(owner.uid, customerId, patch);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  let activity = null;
  if (body.activity?.type && body.activity.title) {
    activity = await addCrmActivity(owner.uid, {
      customerId,
      type: body.activity.type,
      title: clean(body.activity.title, 200),
      body: clean(body.activity.body, 4000)
    });
  }
  return NextResponse.json({ customer, activity });
}

export async function DELETE(request: Request) {
  const owner = await requireOwnerContext(request);
  const customerId = new URL(request.url).searchParams.get("customerId") || "";
  const deleted = await softDeleteCustomer(owner.uid, customerId);
  return deleted
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Customer not found" }, { status: 404 });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
