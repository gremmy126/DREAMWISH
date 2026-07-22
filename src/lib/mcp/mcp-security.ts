import { isIP } from "node:net";
import { McpClientError } from "./mcp-types";

// SSRF defense for outbound MCP connections. The MCP client only ever runs on
// the server, with per-user isolation at the repository layer; this module
// makes sure a registered server URL cannot be pointed at internal
// infrastructure.

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0", "[::1]", "::1"]);

const PRIVATE_IPV4 =
  /^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.)/u;

export function isLocalMcpAllowed(): boolean {
  // Local/stdio-style servers (e.g. a developer's `od mcp` daemon proxy) are
  // opt-in and meant for local development only — never enabled on Railway.
  return process.env.MCP_ALLOW_LOCAL === "1" && process.env.NODE_ENV !== "production";
}

export function validateMcpServerUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new McpClientError("INVALID_URL", "올바른 MCP 서버 URL이 아닙니다.", 400);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new McpClientError("INVALID_URL", "MCP 서버는 http(s) URL만 지원합니다.", 400);
  }
  if (url.username || url.password) {
    throw new McpClientError("INVALID_URL", "URL에 자격 증명을 포함할 수 없습니다.", 400);
  }

  const hostname = url.hostname.toLowerCase();
  const isPrivate =
    PRIVATE_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    (isIP(hostname) === 4 && PRIVATE_IPV4.test(hostname)) ||
    (isIP(hostname.replace(/^\[|\]$/gu, "")) === 6 &&
      /^(?:\[?::1\]?|\[?f[cd])/iu.test(hostname));

  if (isPrivate && !isLocalMcpAllowed()) {
    throw new McpClientError(
      "PRIVATE_HOST_BLOCKED",
      "사설/로컬 네트워크 MCP 서버는 차단됩니다. 로컬 개발에서는 MCP_ALLOW_LOCAL=1로 허용할 수 있습니다.",
      400
    );
  }

  if (url.protocol === "http:" && !isPrivate) {
    throw new McpClientError(
      "HTTPS_REQUIRED",
      "외부 MCP 서버는 HTTPS만 허용됩니다.",
      400
    );
  }

  return url;
}

/** Mask a secret for logs/UI: keep a short prefix, hide the rest. */
export function maskSecret(secret: string): string {
  if (!secret) return "";
  if (secret.length <= 8) return "••••";
  return `${secret.slice(0, 4)}…${"•".repeat(4)}`;
}
