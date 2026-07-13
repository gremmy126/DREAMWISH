import { AIProviderError } from "@/src/lib/ai/errors";

export type AuthRouteError = {
  status: 401 | 500;
  message: string;
};

export function getAuthRouteError(error: unknown): AuthRouteError {
  if (error instanceof AIProviderError && error.code === "UNAUTHORIZED") {
    return { status: 401, message: "Firebase authentication failed." };
  }

  return {
    status: 500,
    message: "Authentication service is temporarily unavailable."
  };
}
