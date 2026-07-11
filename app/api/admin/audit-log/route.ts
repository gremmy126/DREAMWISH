import { NextResponse } from "next/server";
import { listAuditLogEntries } from "@/src/lib/security/audit-log";

export async function GET() {
  try {
    const entries = await listAuditLogEntries("admin");
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit Log 접근이 차단되었습니다." },
      { status: 403 }
    );
  }
}
