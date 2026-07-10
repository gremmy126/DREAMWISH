import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { searchWeb } from "@/src/lib/web-search/web-search.service";

export async function POST(request: Request) {
  const parsed = await parseJsonRequestBody<{ query?: unknown }>(request);

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

  try {
    const results = await searchWeb(query);
    return NextResponse.json(apiSuccess({ query, provider: "web", results }));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "WEB_SEARCH_FAILED",
          message:
            error instanceof Error ? error.message : "Web search failed."
        }
      },
      { status: 502 }
    );
  }
}
