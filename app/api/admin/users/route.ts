import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { listOperationalAccounts } from "@/src/lib/admin/account-admin.repository";

export async function GET(request: Request) {
  await requireAdminContext(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const limit = Number(url.searchParams.get("limit") || 50);
  const offset = Number(url.searchParams.get("offset") || 0);
  const users = await listOperationalAccounts({ query, limit, offset });
  return NextResponse.json({ ok: true, users, nextOffset: offset + users.length });
}
