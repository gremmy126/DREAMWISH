import { isAdminEmail } from "./access-control";
import type { SessionClaims } from "./session-token";

export type ApiAccessClass = "public" | "billing" | "protected" | "admin";

export type ApiAccessDecision =
  | { allowed: true }
  | {
      allowed: false;
      status: 401 | 402 | 403 | 410;
      code: "UNAUTHORIZED" | "PAYMENT_REQUIRED" | "FORBIDDEN" | "FEATURE_RETIRED";
    };

// Stage 1 retirement: automation, integrations, business, CRM, and calendar
// left the product. Their stores stay readable (GET) for backup/export, but
// every write is refused so no new data can be created. See
// docs/stage-1-audit.md for the export procedure.
const RETIRED_API_PREFIXES = [
  "/api/automation",
  "/api/integrations",
  "/api/crm",
  "/api/erp",
  "/api/business",
  "/api/calendar",
  "/api/oauth",
  "/api/workflow",
  "/api/webhooks/automation"
] as const;

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isRetiredApiWrite(pathname: string, method: string): boolean {
  const path = normalizePathname(pathname);
  if (!WRITE_METHODS.has(method.toUpperCase())) return false;
  return RETIRED_API_PREFIXES.some((prefix) => isPathOrChild(path, prefix));
}

type AccessClaims = Pick<SessionClaims, "email" | "paid"> &
  Partial<Pick<SessionClaims, "entitled" | "role">>;

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout",
  // The MFA verification endpoint authenticates with the single-purpose
  // `dreamwish-mfa-challenge` cookie. That cookie is never a session:
  // middleware and owner context read only `dreamwish-session`, so the
  // challenge cookie grants no other API access. Only this endpoint (and
  // logout, which clears it) may accept the challenge cookie.
  "/api/auth/mfa/verify",
  "/api/auth/oauth/kakao/start",
  "/api/auth/oauth/kakao/callback",
  "/api/auth/oauth/naver/start",
  "/api/auth/oauth/naver/callback",
  "/api/coupons/prepare",
  "/api/webhooks/polar",
  "/api/webhooks/portone/v2",
  "/api/webhooks/portone/v1"
]);

const BILLING_API_PATHS = new Set([
  "/api/auth/me",
  "/api/billing/checkout",
  "/api/billing/status",
  "/api/billing/portal"
]);

const OAUTH_CALLBACK_PATTERN = /^\/api\/(?:oauth\/[^/]+\/callback|integrations\/[^/]+\/(?:oauth\/)?callback)$/u;
const DEVICE_COMPANION_PATTERN = /^\/api\/devices\/(?:pair|[^/]+\/(?:sync|push-token|disconnect)|pairing-challenges\/[^/]+\/(?:register|status))$/u;
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
    DEVICE_COMPANION_PATTERN.test(path) ||
    AUTOMATION_WEBHOOK_PATTERN.test(path)
  ) {
    return "public";
  }
  if (BILLING_API_PATHS.has(path) || isPathOrChild(path, "/api/billing")) return "billing";
  // Survey member endpoints require sign-in but never a paid subscription:
  // every targeted employee must be able to see and answer their surveys.
  if (isPathOrChild(path, "/api/surveys/member")) return "billing";
  if (isPathOrChild(path, ADMIN_API_PREFIX)) return "admin";
  return "protected";
}

export function decideApiRequestAccess(
  pathname: string,
  method: string,
  claims: AccessClaims | null
): ApiAccessDecision {
  if (isRetiredApiWrite(pathname, method)) {
    return { allowed: false, status: 410, code: "FEATURE_RETIRED" };
  }
  return decideApiAccess(pathname, claims);
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
