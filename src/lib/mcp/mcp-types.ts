import { z } from "zod";

// Shared MCP (Model Context Protocol) types. Capability shapes come from live
// discovery — tool names and schemas are NEVER hardcoded anywhere in DreamWish.

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export const jsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional()
});

export const jsonRpcResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).nullable().optional(),
  result: z.unknown().optional(),
  error: jsonRpcErrorSchema.optional()
});

export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

export const mcpToolSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional()
});

export const mcpResourceSchema = z.object({
  uri: z.string().min(1),
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional()
});

export const mcpPromptSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional()
      })
    )
    .optional()
});

export type McpTool = z.infer<typeof mcpToolSchema>;
export type McpResource = z.infer<typeof mcpResourceSchema>;
export type McpPrompt = z.infer<typeof mcpPromptSchema>;

export type McpServerInfo = {
  name: string;
  version: string;
  title?: string;
};

export type McpCapabilitySnapshot = {
  serverInfo: McpServerInfo | null;
  protocolVersion: string;
  tools: McpTool[];
  resources: McpResource[];
  prompts: McpPrompt[];
  discoveredAt: string;
};

export const mcpToolCallResultSchema = z.object({
  content: z
    .array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
        data: z.string().optional(),
        mimeType: z.string().optional(),
        uri: z.string().optional()
      })
    )
    .default([]),
  structuredContent: z.unknown().optional(),
  isError: z.boolean().optional()
});

export type McpToolCallResult = z.infer<typeof mcpToolCallResultSchema>;

export class McpClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "McpClientError";
    this.code = code;
    this.status = status;
  }
}
