import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";
import { createMcpServer, listMcpServers } from "@/src/lib/mcp/mcp-server.repository";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  url: z.string().min(8).max(500),
  authToken: z.string().max(4000).optional()
});

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const servers = await listMcpServers(owner.uid);
    return NextResponse.json({ ok: true, servers });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "서버 이름과 URL을 확인해 주세요." },
        { status: 400 }
      );
    }
    const server = await createMcpServer(owner.uid, parsed.data);
    return NextResponse.json({ ok: true, server }, { status: 201 });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
