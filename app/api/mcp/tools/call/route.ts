import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { appendMcpAudit } from "@/src/lib/mcp/mcp-audit.repository";
import { McpHttpClient } from "@/src/lib/mcp/mcp-client";
import { mcpErrorResponse } from "@/src/lib/mcp/mcp-http";
import { getMcpServerConnection } from "@/src/lib/mcp/mcp-server.repository";
import { McpClientError } from "@/src/lib/mcp/mcp-types";

export const maxDuration = 120;

const callSchema = z.object({
  serverId: z.string().min(1),
  toolName: z.string().min(1).max(200),
  arguments: z.record(z.string(), z.unknown()).default({}),
  timeoutMs: z.number().int().min(3_000).max(110_000).optional()
});

// Tool invocation. The tool must exist in the server's last discovery
// snapshot (allowlist), and results are returned as untrusted data — the UI
// renders them as text/preview, never executes them outside the sandbox.
export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const owner = await requireOwnerContext(request);
    const parsed = callSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "호출 형식을 확인해 주세요." }, { status: 400 });
    }
    const { serverId, toolName, arguments: args, timeoutMs } = parsed.data;
    const connection = await getMcpServerConnection(owner.uid, serverId);

    const known = connection.view.capabilities?.tools.some((tool) => tool.name === toolName);
    if (!known) {
      throw new McpClientError(
        "TOOL_NOT_DISCOVERED",
        "이 서버의 Discovery 결과에 없는 tool입니다. 먼저 연결 테스트(Discovery)를 실행해 주세요.",
        409
      );
    }

    const client = new McpHttpClient({
      url: connection.url,
      authToken: connection.authToken || undefined
    });
    try {
      await client.initialize();
      const result = await client.callTool(toolName, args, { timeoutMs });
      await appendMcpAudit(owner.uid, {
        serverId,
        serverName: connection.view.name,
        action: "tool_call",
        detail: `${toolName}(${JSON.stringify(args).slice(0, 120)})`,
        ok: !result.isError,
        durationMs: Date.now() - startedAt,
        error: result.isError ? "tool returned isError" : null
      });
      return NextResponse.json({ ok: true, result });
    } catch (error) {
      await appendMcpAudit(owner.uid, {
        serverId,
        serverName: connection.view.name,
        action: "tool_call",
        detail: toolName,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw error;
    }
  } catch (error) {
    return mcpErrorResponse(error);
  }
}
