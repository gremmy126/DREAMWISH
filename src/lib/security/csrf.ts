import { getPublicAppUrl } from "../oauth/oauth-redirect";

export class CsrfValidationError extends Error {
  readonly code = "CSRF_VALIDATION_FAILED" as const;
  readonly status = 403 as const;

  constructor(message = "The request origin could not be verified.") {
    super(message);
    this.name = "CsrfValidationError";
  }
}

export function assertSameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const requestOrigin = new URL(request.url).origin;
  const publicOrigin = getPublicAppUrl(request.url);

  if (origin && origin !== requestOrigin && origin !== publicOrigin) {
    throw new CsrfValidationError();
  }
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new CsrfValidationError();
  }
  if (!origin && !fetchSite && process.env.NODE_ENV === "production") {
    throw new CsrfValidationError();
  }
}
