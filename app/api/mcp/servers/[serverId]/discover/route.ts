import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { appendMcpAudit } from "@/src/lib/mcp/mcp-audit.repository";
import { McpHttpClient } from "@/src/lib/mcp/mcp-client";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";
import {
  getMcpServerConnection,
  updateMcpServer
} from "@/src/lib/mcp/mcp-server.repository";

export const maxDuration = 60;

// Connection test + capability discovery in one call. Tool/resource/prompt
// lists come exclusively from the live server response.
export async function POST(request: Request, context: { params: Promise<{ serverId: string }> }) {
  const startedAt = Date.now();
  try {
    const owner = await requireOwnerContext(request);
    const { serverId } = await context.params;
    const connection = await getMcpServerConnection(owner.uid, serverId);
    const client = new McpHttpClient({
      url: connection.url,
      authToken: connection.authToken || undefined
    });

    try {
      const capabilities = await client.discover();
      const server = await updateMcpServer(owner.uid, serverId, {
        status: "connected",
        lastError: null,
        capabilities
      });
      await appendMcpAudit(owner.uid, {
        serverId,
        serverName: connection.view.name,
        action: "discover",
        detail: `tools=${capabilities.tools.length} resources=${capabilities.resources.length} prompts=${capabilities.prompts.length}`,
        ok: true,
        durationMs: Date.now() - startedAt,
        error: null
      });
      return NextResponse.json({ ok: true, server });
    } catch (error) {
      const message = error instanceof Error ? error.message : "연결에 실패했습니다.";
      await updateMcpServer(owner.uid, serverId, { status: "error", lastError: message });
      await appendMcpAudit(owner.uid, {
        serverId,
        serverName: connection.view.name,
        action: "discover",
        detail: "capability discovery",
        ok: false,
        durationMs: Date.now() - startedAt,
        error: message
      });
      throw error;
    }
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
