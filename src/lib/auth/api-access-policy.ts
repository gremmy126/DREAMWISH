import { isAdminEmail } from "./access-control";
import type { SessionClaims } from "./session-token";

export type ApiAccessClass = "public" | "protected" | "admin";

export type ApiAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 403;
      code: "UNAUTHORIZED" | "FORBIDDEN";
    };

type AccessClaims = Pick<SessionClaims, "email" | "paid">;

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout"
]);

const OAUTH_CALLBACK_PATTERN = /^\/api\/(?:oauth|integrations)\/[^/]+\/callback$/u;
const ADMIN_API_PREFIX = "/api/admin";

export function classifyApiAccess(pathname: string): ApiAccessClass {
  const path = normalizePathname(pathname);

  if (!isPathOrChild(path, "/api")) return "public";
  if (PUBLIC_API_PATHS.has(path) || OAUTH_CALLBACK_PATTERN.test(path)) return "public";
  if (isPathOrChild(path, ADMIN_API_PREFIX)) return "admin";
  return "protected";
}

export function decideApiAccess(
  pathname: string,
  claims: AccessClaims | null
): ApiAccessDecision {
  const accessClass = classifyApiAccess(pathname);

  if (accessClass === "public") return { allowed: true };
  if (!claims) {
    return { allowed: false, status: 401, code: "UNAUTHORIZED" };
  }

  const admin = isAdminEmail(claims.email);
  if (accessClass === "admin") {
    return admin
      ? { allowed: true }
      : { allowed: false, status: 403, code: "FORBIDDEN" };
  }

  return { allowed: true };
}

function normalizePathname(pathname: string): string {
  const withoutQuery = String(pathname || "/").split(/[?#]/u, 1)[0] || "/";
  if (withoutQuery === "/") return withoutQuery;
  return withoutQuery.replace(/\/+$/u, "");
}

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
