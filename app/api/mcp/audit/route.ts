import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listMcpAudit } from "@/src/lib/mcp/mcp-audit.repository";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? "50");
    const entries = await listMcpAudit(
      owner.uid,
      Number.isFinite(limitParam) ? limitParam : 50
    );
    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
