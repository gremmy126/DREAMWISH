import { SESSION_COOKIE_NAME, verifySessionToken } from "./session-token";

export type OwnerContext = {
  uid: string;
  email: string;
  role: "admin" | "user";
};

export class OwnerContextError extends Error {
  readonly code = "AUTH_REQUIRED" as const;
  readonly status = 401 as const;

  constructor() {
    super("Authentication is required.");
    this.name = "OwnerContextError";
  }
}

export async function getOwnerContext(request: Request): Promise<OwnerContext | null> {
  const token = readSessionCookie(request.headers.get("cookie"));
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  return {
    uid: claims.uid,
    email: claims.email,
    role: claims.role
  };
}

export async function requireOwnerContext(request: Request): Promise<OwnerContext> {
  const owner = await getOwnerContext(request);
  if (!owner) throw new OwnerContextError();
  return owner;
}

function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== SESSION_COOKIE_NAME) continue;

    const value = cookie.slice(separatorIndex + 1).trim();
    if (!value) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
}
