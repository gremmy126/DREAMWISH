import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";
import {
  deleteMcpServer,
  getMcpServer,
  updateMcpServer
} from "@/src/lib/mcp/mcp-server.repository";

type RouteContext = { params: Promise<{ serverId: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  url: z.string().min(8).max(500).optional(),
  /** null clears the token; a string replaces it. */
  authToken: z.string().max(4000).nullable().optional(),
  // Kill switch: 사용자·관리자가 서버 호출을 즉시 차단할 수 있다.
  status: z.enum(["disabled", "unverified"]).optional()
});

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { serverId } = await context.params;
    const server = await getMcpServer(owner.uid, serverId);
    if (!server) {
      return NextResponse.json({ ok: false, error: "등록된 MCP 서버가 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, server });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { serverId } = await context.params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "수정 값을 확인해 주세요." }, { status: 400 });
    }
    const server = await updateMcpServer(owner.uid, serverId, parsed.data);
    return NextResponse.json({ ok: true, server });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { serverId } = await context.params;
    await deleteMcpServer(owner.uid, serverId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
