import { randomUUID } from "node:crypto";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";

// Append-only audit trail for MCP activity, owner-scoped and capped. Tool
// arguments are stored as a short preview only — tool results are treated as
// untrusted data and never logged verbatim.

export type McpAuditAction = "connect" | "discover" | "tool_call" | "resource_read" | "prompt_get";

export type McpAuditEntry = {
  id: string;
  serverId: string;
  serverName: string;
  action: McpAuditAction;
  detail: string;
  ok: boolean;
  durationMs: number;
  error: string | null;
  at: string;
};

type AuditDocument = { entries: McpAuditEntry[] };

const NAMESPACE = "mcp.audit.v1";
const EMPTY: AuditDocument = { entries: [] };
const MAX_ENTRIES = 200;

export async function appendMcpAudit(
  ownerId: string,
  entry: Omit<McpAuditEntry, "id" | "at">
): Promise<void> {
  const record: McpAuditEntry = {
    ...entry,
    detail: entry.detail.slice(0, 300),
    error: entry.error ? entry.error.slice(0, 300) : null,
    id: randomUUID(),
    at: new Date().toISOString()
  };
  await mutateOwnerDocument<AuditDocument, void>(ownerId, NAMESPACE, EMPTY, (document) => {
    document.entries.unshift(record);
    document.entries = document.entries.slice(0, MAX_ENTRIES);
  });
}

export async function listMcpAudit(ownerId: string, limit = 50): Promise<McpAuditEntry[]> {
  const document = await readOwnerDocument<AuditDocument>(ownerId, NAMESPACE, EMPTY);
  return document.entries.slice(0, Math.min(Math.max(limit, 1), MAX_ENTRIES));
}
