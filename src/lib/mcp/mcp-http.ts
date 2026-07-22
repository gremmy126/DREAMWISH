import { NextResponse } from "next/server";
import { McpClientError } from "./mcp-types";

/** Uniform error mapping for /api/mcp/* and /api/design/* routes. */
export function mcpErrorResponse(error: unknown) {
  if (error instanceof McpClientError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (
    error instanceof Error &&
    (error.name === "OwnerContextError" ||
      (error as { code?: string }).code === "AUTH_REQUIRED")
  ) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const status = (error as { status?: number }).status;
  if (typeof status === "number" && status >= 400 && status < 600 && error instanceof Error) {
    return NextResponse.json({ ok: false, error: error.message }, { status });
  }
  console.error("[mcp] unexpected error:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { ok: false, error: "요청 처리 중 오류가 발생했습니다." },
    { status: 500 }
  );
}
