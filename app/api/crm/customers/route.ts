import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  addCrmActivity,
  createCustomerDraft,
  listCrmActivities,
  listCustomers,
  upsertCustomer
} from "@/src/lib/crm/crm.repository";
import type { CrmActivity, CustomerImportance, CustomerStatus } from "@/src/lib/crm/crm.types";

export async function GET() {
  return NextResponse.json({
    customers: await listCustomers(),
    activities: await listCrmActivities()
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    phone?: string;
    companyName?: string;
    position?: string;
    memo?: string;
  };
  const customer = await createCustomerDraft({
    name: body.name || "",
    email: body.email || "",
    phone: body.phone || "",
    companyName: body.companyName || "",
    position: body.position || "",
    memo: body.memo
  });
  return NextResponse.json({ customer }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    customerId?: string;
    status?: CustomerStatus;
    importance?: CustomerImportance;
    activity?: Pick<CrmActivity, "type" | "title" | "body">;
  };
  const customer = (await listCustomers()).find((item) => item.id === body.customerId);
  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const updated = await upsertCustomer({
    ...customer,
    status: body.status || customer.status,
    importance: body.importance || customer.importance,
    updatedAt: new Date().toISOString()
  });
  const activity = body.activity
    ? await addCrmActivity({
        id: randomUUID(),
        customerId: customer.id,
        type: body.activity.type,
        title: body.activity.title,
        body: body.activity.body,
        createdAt: new Date().toISOString()
      })
    : null;

  return NextResponse.json({ customer: updated, activity });
}
