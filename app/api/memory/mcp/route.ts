import { NextResponse } from "next/server";
import { listMemoryMcpTools, runMemoryMcpTool } from "@/src/lib/memory/mcp-memory-server";

export async function GET() {
  return NextResponse.json({ tools: listMemoryMcpTools() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    tool?: string;
    payload?: Record<string, unknown>;
  };
  return NextResponse.json(await runMemoryMcpTool(body.tool || "", body.payload || {}));
}
