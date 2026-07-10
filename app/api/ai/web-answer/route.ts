import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import {
  appendWebAnswerReferences,
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  createInsufficientWebAnswer,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import { searchWeb } from "@/src/lib/web-search/web-search.service";

type WebAnswerRequestBody = {
  query?: unknown;
  question?: unknown;
  model?: unknown;
  provider?: unknown;
};

export async function POST(request: Request) {
  const parsed = await parseJsonRequestBody<WebAnswerRequestBody>(request);

  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const query = typeof parsed.data.query === "string" ? parsed.data.query.trim() : "";
  const question =
    typeof parsed.data.question === "string" && parsed.data.question.trim()
      ? parsed.data.question.trim()
      : query;

  if (!query) {
    const failure = apiFailure(400, "QUERY_REQUIRED", "Query is required.");
    return NextResponse.json(
      { ok: false, error: failure.error },
      { status: failure.status }
    );
  }

  try {
    const rawResults = await searchWeb(query);
    const context = selectWebAnswerContext(question, rawResults);
    const references = buildWebAnswerReferences(context);

    if (context.length === 0) {
      return NextResponse.json(
        apiSuccess({
          answer: createInsufficientWebAnswer(),
          references,
          resultsUsed: 0
        })
      );
    }

    const model = parseProviderName(parsed.data.model || parsed.data.provider || "groq");
    const body = await chatWithAI(buildWebAnswerMessages(question, context), model);

    return NextResponse.json(
      apiSuccess({
        answer: appendWebAnswerReferences(body, references),
        references,
        resultsUsed: context.length
      })
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "WEB_SEARCH_FAILED",
          message: error instanceof Error ? error.message : "Web answer generation failed."
        }
      },
      { status: 502 }
    );
  }
}
