import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listMemoryMcpTools, runMemoryMcpTool } from "@/src/lib/memory/mcp-memory-server";

export async function GET(request: Request) {
  try {
    await requireOwnerContext(request);
    return NextResponse.json({ tools: listMemoryMcpTools() });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      tool?: string;
      payload?: Record<string, unknown>;
    };
    return NextResponse.json(await runMemoryMcpTool(owner.uid, body.tool || "", body.payload || {}));
  } catch (error) {
    return routeError(error);
  }
}

function routeError(error: unknown) {
  const known = error instanceof OwnerContextError;
  return NextResponse.json(
    { error: { code: known ? error.code : "MEMORY_MCP_FAILED", message: error instanceof Error ? error.message : "MCP request failed" } },
    { status: known ? error.status : 500 }
  );
}
