import { NextResponse } from "next/server";
import { listAuditLogEntries } from "@/src/lib/security/audit-log";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { listAdminAuditEvents } from "@/src/lib/admin/account-admin.repository";

export async function GET(request: Request) {
  try {
    await requireAdminContext(request);
    const [entries, administratorEvents] = await Promise.all([
      listAuditLogEntries("admin"),
      listAdminAuditEvents()
    ]);
    return NextResponse.json({ entries, administratorEvents });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit Log 접근이 차단되었습니다." },
      { status: 403 }
    );
  }
}
