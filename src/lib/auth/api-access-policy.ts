import { isAdminEmail } from "./access-control";
import type { SessionClaims } from "./session-token";

export type ApiAccessClass = "public" | "billing" | "protected" | "admin";

export type ApiAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 402 | 403;
      code: "UNAUTHORIZED" | "PAYMENT_REQUIRED" | "FORBIDDEN";
    };

type AccessClaims = Pick<SessionClaims, "email" | "paid"> &
  Partial<Pick<SessionClaims, "entitled" | "role">>;

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/oauth/kakao/start",
  "/api/auth/oauth/kakao/callback",
  "/api/auth/oauth/naver/start",
  "/api/auth/oauth/naver/callback",
  "/api/webhooks/polar"
]);

const BILLING_API_PATHS = new Set([
  "/api/billing/checkout",
  "/api/billing/status",
  "/api/billing/portal"
]);

const OAUTH_CALLBACK_PATTERN = /^\/api\/(?:oauth\/[^/]+\/callback|integrations\/[^/]+\/(?:oauth\/)?callback)$/u;
const DEVICE_SECRET_PATTERN = /^\/api\/devices\/(?:pair|[^/]+\/sync)$/u;
// Custom automation webhooks authenticate with their own per-webhook secret,
// not a session cookie: external services must be able to call them.
const AUTOMATION_WEBHOOK_PATTERN = /^\/api\/webhooks\/automation\/[^/]+$/u;
const ADMIN_API_PREFIX = "/api/admin";

export function classifyApiAccess(pathname: string): ApiAccessClass {
  const path = normalizePathname(pathname);

  if (!isPathOrChild(path, "/api")) return "public";
  if (
    PUBLIC_API_PATHS.has(path) ||
    OAUTH_CALLBACK_PATTERN.test(path) ||
    DEVICE_SECRET_PATTERN.test(path) ||
    AUTOMATION_WEBHOOK_PATTERN.test(path)
  ) {
    return "public";
  }
  if (BILLING_API_PATHS.has(path)) return "billing";
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

  const admin = claims.role === "admin" || isAdminEmail(claims.email);
  if (accessClass === "admin") {
    return admin
      ? { allowed: true }
      : { allowed: false, status: 403, code: "FORBIDDEN" };
  }

  if (accessClass === "billing" || admin || (claims.entitled ?? claims.paid)) {
    return { allowed: true };
  }

  return { allowed: false, status: 402, code: "PAYMENT_REQUIRED" };
}

function normalizePathname(pathname: string): string {
  const withoutQuery = String(pathname || "/").split(/[?#]/u, 1)[0] || "/";
  if (withoutQuery === "/") return withoutQuery;
  return withoutQuery.replace(/\/+$/u, "");
}

function isPathOrChild(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
