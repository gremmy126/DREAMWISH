import assert from "node:assert/strict";
import { extractSseJsonRpcResponse } from "../src/lib/mcp/mcp-client";
import { maskSecret, validateMcpServerUrl } from "../src/lib/mcp/mcp-security";
import { McpClientError, jsonRpcResponseSchema, mcpToolSchema } from "../src/lib/mcp/mcp-types";

test("MCP server URLs must be https and never private hosts", () => {
  assert.equal(
    validateMcpServerUrl("https://mcp.example.com/mcp").hostname,
    "mcp.example.com"
  );
  for (const blocked of [
    "http://mcp.example.com/mcp", // http to a public host
    "https://localhost:3845/mcp",
    "https://127.0.0.1/mcp",
    "https://10.0.0.8/mcp",
    "https://192.168.1.10/mcp",
    "https://172.16.0.1/mcp",
    "https://169.254.169.254/latest/meta-data", // cloud metadata endpoint
    "https://internal.service.local/mcp",
    "ftp://mcp.example.com",
    "https://user:pass@mcp.example.com/mcp",
    "not a url"
  ]) {
    assert.throws(
      () => validateMcpServerUrl(blocked),
      McpClientError,
      `should reject ${blocked}`
    );
  }
});

test("SSE stream parsing finds the JSON-RPC response for the request id", () => {
  const stream =
    'event: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"tools":[]}}\n\n' +
    'data: {"jsonrpc":"2.0","id":8,"result":{}}\n\n';
  const raw = extractSseJsonRpcResponse(stream, 7);
  const parsed = jsonRpcResponseSchema.parse(JSON.parse(raw));
  assert.equal(parsed.id, 7);
  assert.throws(() => extractSseJsonRpcResponse(stream, 99), McpClientError);
});

test("discovered tool definitions validate against the schema", () => {
  const valid = mcpToolSchema.safeParse({
    name: "create_artifact",
    description: "Create an artifact",
    inputSchema: { type: "object" }
  });
  assert.equal(valid.success, true);
  assert.equal(mcpToolSchema.safeParse({ description: "no name" }).success, false);
});

test("secrets are masked before they reach logs or UI", () => {
  assert.equal(maskSecret(""), "");
  assert.equal(maskSecret("short"), "••••");
  const masked = maskSecret("sk-verysecretvalue1234");
  assert.ok(masked.startsWith("sk-v"));
  assert.ok(!masked.includes("secret"));
});
