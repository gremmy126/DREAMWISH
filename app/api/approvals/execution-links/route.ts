import { NextResponse } from "next/server";
import { listApprovalExecutionLinks } from "@/src/lib/repositories/approval-execution-link.repository";

export async function GET() {
  return NextResponse.json({ links: await listApprovalExecutionLinks() });
}
