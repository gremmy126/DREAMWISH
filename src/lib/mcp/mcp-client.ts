import { validateMcpServerUrl } from "./mcp-security";
import {
  MCP_PROTOCOL_VERSION,
  McpClientError,
  jsonRpcResponseSchema,
  mcpPromptSchema,
  mcpResourceSchema,
  mcpToolCallResultSchema,
  mcpToolSchema,
  type JsonRpcResponse,
  type McpCapabilitySnapshot,
  type McpPrompt,
  type McpResource,
  type McpServerInfo,
  type McpTool,
  type McpToolCallResult
} from "./mcp-types";

// Minimal MCP client over Streamable HTTP. Server-side only. Everything the
// client knows about a server (tools, resources, prompts) comes from live
// discovery — nothing is hardcoded. stdio transport is intentionally not
// implemented in the web runtime: spawning local processes belongs to desktop
// environments (see the Open Design daemon analysis), not a Railway web dyno.

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 4_000_000;

// JSON-RPC "method not found" — servers without resources/prompts return this.
const METHOD_NOT_FOUND = -32601;

type McpConnectionOptions = {
  url: string;
  authToken?: string;
  timeoutMs?: number;
};

export class McpHttpClient {
  private readonly endpoint: URL;
  private readonly authToken: string | undefined;
  private readonly timeoutMs: number;
  private sessionId: string | null = null;
  private requestSeq = 0;

  constructor(options: McpConnectionOptions) {
    this.endpoint = validateMcpServerUrl(options.url);
    this.authToken = options.authToken || undefined;
    this.timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 3_000), 120_000);
  }

  /** initialize + notifications/initialized handshake. */
  async initialize(): Promise<{ serverInfo: McpServerInfo | null; protocolVersion: string }> {
    const result = (await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "dreamwish", title: "DreamWish MCP Host", version: "1.0.0" }
    })) as {
      protocolVersion?: string;
      serverInfo?: { name?: string; version?: string; title?: string };
    } | null;

    await this.notify("notifications/initialized");

    const info = result?.serverInfo;
    return {
      serverInfo:
        info && typeof info.name === "string"
          ? { name: info.name, version: String(info.version ?? ""), title: info.title }
          : null,
      protocolVersion:
        typeof result?.protocolVersion === "string"
          ? result.protocolVersion
          : MCP_PROTOCOL_VERSION
    };
  }

  async listTools(): Promise<McpTool[]> {
    const items = await this.listAll("tools/list", "tools");
    return items.flatMap((item) => {
      const parsed = mcpToolSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  async listResources(): Promise<McpResource[]> {
    const items = await this.listAll("resources/list", "resources");
    return items.flatMap((item) => {
      const parsed = mcpResourceSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  async listPrompts(): Promise<McpPrompt[]> {
    const items = await this.listAll("prompts/list", "prompts");
    return items.flatMap((item) => {
      const parsed = mcpPromptSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  }

  /** Full capability discovery: initialize + tools/resources/prompts. */
  async discover(): Promise<McpCapabilitySnapshot> {
    const { serverInfo, protocolVersion } = await this.initialize();
    const [tools, resources, prompts] = await Promise.all([
      this.listTools(),
      this.listResources(),
      this.listPrompts()
    ]);
    return {
      serverInfo,
      protocolVersion,
      tools,
      resources,
      prompts,
      discoveredAt: new Date().toISOString()
    };
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<McpToolCallResult> {
    const result = await this.request(
      "tools/call",
      { name, arguments: args },
      options?.timeoutMs
    );
    const parsed = mcpToolCallResultSchema.safeParse(result);
    if (!parsed.success) {
      throw new McpClientError("INVALID_TOOL_RESULT", "MCP tool 결과 형식을 해석하지 못했습니다.");
    }
    return parsed.data;
  }

  async readResource(uri: string): Promise<unknown> {
    return this.request("resources/read", { uri });
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<unknown> {
    return this.request("prompts/get", { name, arguments: args ?? {} });
  }

  // --- transport -----------------------------------------------------------

  private async listAll(method: string, key: string): Promise<unknown[]> {
    const collected: unknown[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      let result: unknown;
      try {
        result = await this.request(method, cursor ? { cursor } : {});
      } catch (error) {
        if (error instanceof McpClientError && error.code === `RPC_${METHOD_NOT_FOUND}`) {
          return collected; // Server does not support this capability.
        }
        throw error;
      }
      const record = (result ?? {}) as Record<string, unknown>;
      const items = record[key];
      if (Array.isArray(items)) collected.push(...items);
      cursor = typeof record.nextCursor === "string" && record.nextCursor ? record.nextCursor : undefined;
      if (!cursor) break;
    }
    return collected;
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<unknown> {
    this.requestSeq += 1;
    const id = this.requestSeq;
    const response = await this.post(
      { jsonrpc: "2.0", id, method, params },
      timeoutMs ?? this.timeoutMs
    );
    if (response.error) {
      throw new McpClientError(
        `RPC_${response.error.code}`,
        `MCP 서버 오류(${method}): ${response.error.message}`
      );
    }
    return response.result;
  }

  private async notify(method: string): Promise<void> {
    try {
      await this.post({ jsonrpc: "2.0", method }, this.timeoutMs, true);
    } catch {
      // Notifications are fire-and-forget; some servers return 202/empty.
    }
  }

  private async post(
    body: Record<string, unknown>,
    timeoutMs: number,
    isNotification = false
  ): Promise<JsonRpcResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        redirect: "manual", // SSRF/redirect defense — never silently follow.
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
          ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
          ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {})
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new McpClientError("TIMEOUT", `MCP 서버 응답이 ${timeoutMs / 1000}초를 초과했습니다.`, 504);
      }
      throw new McpClientError(
        "CONNECT_FAILED",
        `MCP 서버에 연결하지 못했습니다: ${error instanceof Error ? error.message : "unknown"}`
      );
    } finally {
      clearTimeout(timer);
    }

    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;

    if (response.status >= 300 && response.status < 400) {
      throw new McpClientError("REDIRECT_BLOCKED", "MCP 서버가 리다이렉트를 반환해 차단했습니다.");
    }
    if (isNotification && (response.status === 202 || response.status === 204)) {
      return { jsonrpc: "2.0" };
    }
    if (!response.ok) {
      throw new McpClientError(
        "HTTP_ERROR",
        `MCP 서버가 HTTP ${response.status}을(를) 반환했습니다.`,
        response.status === 401 || response.status === 403 ? 401 : 502
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await readBounded(response);
    if (isNotification) return { jsonrpc: "2.0" };

    const payload = contentType.includes("text/event-stream")
      ? extractSseJsonRpcResponse(raw, body.id as number)
      : raw;

    return parseJsonRpc(payload);
  }
}

async function readBounded(response: Response): Promise<string> {
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new McpClientError("RESPONSE_TOO_LARGE", "MCP 서버 응답이 허용 크기를 초과했습니다.");
  }
  return text;
}

/**
 * Pull the JSON-RPC response matching `id` out of an SSE stream body.
 * Exported for tests.
 */
export function extractSseJsonRpcResponse(sseBody: string, id: number | string): string {
  const events = sseBody.split(/\n\n/u);
  for (const event of events) {
    const data = event
      .split(/\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) continue;
    try {
      const parsed = JSON.parse(data) as { id?: unknown };
      if (parsed && parsed.id === id) return data;
    } catch {
      continue;
    }
  }
  throw new McpClientError("NO_RESPONSE", "MCP 서버 스트림에서 응답을 찾지 못했습니다.");
}

function parseJsonRpc(raw: string): JsonRpcResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new McpClientError("INVALID_JSON", "MCP 서버 응답이 올바른 JSON이 아닙니다.");
  }
  const result = jsonRpcResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new McpClientError("INVALID_JSONRPC", "MCP 서버 응답이 JSON-RPC 2.0 형식이 아닙니다.");
  }
  return result.data;
}
