import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { hybridSearchResults } from "@/src/lib/search/search.service";

export async function POST(request: Request) {
  const parsed = await parseJsonRequestBody<{ query?: unknown; limit?: unknown }>(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const query = typeof parsed.data.query === "string" ? parsed.data.query.trim() : "";

  if (!query) {
    const failure = apiFailure(400, "QUERY_REQUIRED", "Query is required.");
    return NextResponse.json(
      { ok: false, error: failure.error },
      { status: failure.status }
    );
  }

  const limit =
    typeof parsed.data.limit === "number" && Number.isFinite(parsed.data.limit)
      ? Math.min(50, Math.max(1, Math.trunc(parsed.data.limit)))
      : 12;
  const results = await hybridSearchResults(query, limit);
  return NextResponse.json(apiSuccess({ results }));
}
