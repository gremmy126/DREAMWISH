import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { listOperationalAccounts } from "@/src/lib/admin/account-admin.repository";

export async function GET(request: Request) {
  await requireAdminContext(request);
  const accounts = await listOperationalAccounts({ limit: 100 });
  const now = Date.now();
  return NextResponse.json({
    ok: true,
    overview: {
      totalUsers: accounts.length,
      activeUsers: accounts.filter((item) => item.status === "active").length,
      administrators: accounts.filter((item) => item.role === "admin" && item.status === "active").length,
      pendingDeletion: accounts.filter((item) => item.status === "deletion_pending").length,
      signedInLast24Hours: accounts.filter(
        (item) => now - new Date(item.lastLoginAt).getTime() <= 86_400_000
      ).length
    }
  });
}
