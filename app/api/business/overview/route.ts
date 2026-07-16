import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  buildBusinessOverview,
  resolveBusinessPeriod
} from "@/src/lib/business/business-overview";
import { listRevenueCandidates } from "@/src/lib/business/revenue.repository";
import { listCrmDeals, listCrmTasks, listCustomers } from "@/src/lib/crm/crm.repository";
import { getErpSnapshot } from "@/src/lib/erp/erp.repository";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    const period = resolveBusinessPeriod(url.searchParams.get("period"), {
      start: url.searchParams.get("start") || undefined,
      end: url.searchParams.get("end") || undefined
    });

    const [customers, deals, tasks, revenueCandidates, erp] = await Promise.all([
      listCustomers(owner.uid),
      listCrmDeals(owner.uid),
      listCrmTasks(owner.uid),
      listRevenueCandidates(owner.uid),
      getErpSnapshot(owner.uid)
    ]);

    const overview = buildBusinessOverview({
      customers,
      deals,
      tasks,
      revenueCandidates,
      payments: erp.payments,
      expenses: erp.expenses,
      invoices: erp.invoices,
      products: erp.products,
      projects: erp.projects,
      period
    });

    return NextResponse.json(
      { ok: true, data: overview },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    if (error instanceof OwnerContextError) {
      return NextResponse.json(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: error.status }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Business overview failed." }
      },
      { status: 500 }
    );
  }
}
