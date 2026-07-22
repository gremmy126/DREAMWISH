import { randomUUID } from "node:crypto";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";
import { decryptToken, encryptToken } from "../oauth/token-encryption";
import { maskSecret, validateMcpServerUrl } from "./mcp-security";
import { McpClientError, type McpCapabilitySnapshot } from "./mcp-types";

// Registered MCP servers, isolated per owner. Auth tokens are sealed with the
// existing AES-256-GCM token encryption and never leave the server process —
// list/detail responses only ever expose a masked hint.

export type McpServerStatus = "unverified" | "connected" | "error" | "disabled";

type StoredMcpServer = {
  id: string;
  name: string;
  url: string;
  /** encryptToken() output; empty string when the server needs no auth. */
  sealedAuthToken: string;
  status: McpServerStatus;
  lastError: string | null;
  capabilities: McpCapabilitySnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type McpServerView = {
  id: string;
  name: string;
  url: string;
  authTokenHint: string;
  hasAuthToken: boolean;
  status: McpServerStatus;
  lastError: string | null;
  capabilities: McpCapabilitySnapshot | null;
  createdAt: string;
  updatedAt: string;
};

type ServerDocument = { servers: StoredMcpServer[] };

const NAMESPACE = "mcp.servers.v1";
const EMPTY: ServerDocument = { servers: [] };
const MAX_SERVERS = 12;

export async function listMcpServers(ownerId: string): Promise<McpServerView[]> {
  const document = await readOwnerDocument<ServerDocument>(ownerId, NAMESPACE, EMPTY);
  return document.servers.map(toView);
}

export async function getMcpServer(
  ownerId: string,
  serverId: string
): Promise<McpServerView | null> {
  const stored = await getStored(ownerId, serverId);
  return stored ? toView(stored) : null;
}

/** Server-side only: URL + decrypted token for opening a connection. */
export async function getMcpServerConnection(
  ownerId: string,
  serverId: string
): Promise<{ view: McpServerView; url: string; authToken: string }> {
  const stored = await getStored(ownerId, serverId);
  if (!stored) throw new McpClientError("SERVER_NOT_FOUND", "등록된 MCP 서버가 없습니다.", 404);
  if (stored.status === "disabled") {
    throw new McpClientError("SERVER_DISABLED", "비활성화된 MCP 서버입니다. 먼저 활성화해 주세요.", 409);
  }
  return {
    view: toView(stored),
    url: stored.url,
    authToken: stored.sealedAuthToken ? decryptToken(stored.sealedAuthToken) : ""
  };
}

export async function createMcpServer(
  ownerId: string,
  input: { name: string; url: string; authToken?: string }
): Promise<McpServerView> {
  const url = validateMcpServerUrl(input.url).toString();
  const now = new Date().toISOString();
  const server: StoredMcpServer = {
    id: randomUUID(),
    name: input.name.trim().slice(0, 80) || "MCP Server",
    url,
    sealedAuthToken: input.authToken?.trim() ? encryptToken(input.authToken.trim()) : "",
    status: "unverified",
    lastError: null,
    capabilities: null,
    createdAt: now,
    updatedAt: now
  };

  await mutateOwnerDocument<ServerDocument, void>(ownerId, NAMESPACE, EMPTY, (document) => {
    if (document.servers.length >= MAX_SERVERS) {
      throw new McpClientError(
        "SERVER_LIMIT",
        `MCP 서버는 최대 ${MAX_SERVERS}개까지 등록할 수 있습니다.`,
        409
      );
    }
    if (document.servers.some((item) => item.url === url)) {
      throw new McpClientError("SERVER_DUPLICATE", "이미 같은 URL의 서버가 등록되어 있습니다.", 409);
    }
    document.servers.push(server);
  });
  return toView(server);
}

export async function updateMcpServer(
  ownerId: string,
  serverId: string,
  patch: {
    name?: string;
    url?: string;
    authToken?: string | null;
    status?: McpServerStatus;
    lastError?: string | null;
    capabilities?: McpCapabilitySnapshot | null;
  }
): Promise<McpServerView> {
  return mutateOwnerDocument<ServerDocument, McpServerView>(
    ownerId,
    NAMESPACE,
    EMPTY,
    (document) => {
      const server = document.servers.find((item) => item.id === serverId);
      if (!server) throw new McpClientError("SERVER_NOT_FOUND", "등록된 MCP 서버가 없습니다.", 404);

      if (typeof patch.name === "string" && patch.name.trim()) {
        server.name = patch.name.trim().slice(0, 80);
      }
      if (typeof patch.url === "string" && patch.url.trim()) {
        const next = validateMcpServerUrl(patch.url).toString();
        if (next !== server.url) {
          server.url = next;
          server.status = "unverified";
          server.capabilities = null;
        }
      }
      if (patch.authToken !== undefined) {
        server.sealedAuthToken = patch.authToken?.trim()
          ? encryptToken(patch.authToken.trim())
          : "";
        server.status = "unverified";
      }
      if (patch.status) server.status = patch.status;
      if (patch.lastError !== undefined) server.lastError = patch.lastError;
      if (patch.capabilities !== undefined) server.capabilities = patch.capabilities;
      server.updatedAt = new Date().toISOString();
      return toView(server);
    }
  );
}

export async function deleteMcpServer(ownerId: string, serverId: string): Promise<void> {
  await mutateOwnerDocument<ServerDocument, void>(ownerId, NAMESPACE, EMPTY, (document) => {
    const before = document.servers.length;
    document.servers = document.servers.filter((item) => item.id !== serverId);
    if (document.servers.length === before) {
      throw new McpClientError("SERVER_NOT_FOUND", "등록된 MCP 서버가 없습니다.", 404);
    }
  });
}

async function getStored(ownerId: string, serverId: string): Promise<StoredMcpServer | null> {
  const document = await readOwnerDocument<ServerDocument>(ownerId, NAMESPACE, EMPTY);
  return document.servers.find((item) => item.id === serverId) ?? null;
}

function toView(server: StoredMcpServer): McpServerView {
  return {
    id: server.id,
    name: server.name,
    url: server.url,
    hasAuthToken: Boolean(server.sealedAuthToken),
    authTokenHint: server.sealedAuthToken ? maskSecret("token-set-hidden") : "",
    status: server.status,
    lastError: server.lastError,
    capabilities: server.capabilities,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt
  };
}
