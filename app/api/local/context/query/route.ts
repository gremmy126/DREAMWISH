import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { suggestConnectionsForQuery } from "@/src/lib/connections/connections.service";
import {
  buildRelevantContextPayload,
  filterRelevantResults,
  shouldUseExternalWebContext
} from "@/src/lib/context/relevance";
import { searchChatMessages } from "@/src/lib/db/repositories/chat.repository";
import { buildContextNetwork } from "@/src/lib/network/network.service";
import { apiSuccess } from "@/src/lib/api/api-response";
import { parseContextQueryRequest } from "@/src/lib/api/context-query-request";
import { hybridSearchResults } from "@/src/lib/search/search.service";
import type { SearchResult } from "@/src/lib/search/search.types";
import { searchWeb, webResultsToSearchResults } from "@/src/lib/web-search/web-search.service";

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    const parsed = await parseContextQueryRequest(request);

    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error, requestId },
        { status: parsed.status }
      );
    }

    const { query, limit } = parsed.data;
    const shouldSearchWeb = shouldUseExternalWebContext(query);
    const settled = await Promise.allSettled([
      hybridSearchResults(query, limit),
      suggestConnectionsForQuery(query),
      shouldSearchWeb ? searchWeb(query, 6) : Promise.resolve([]),
      searchChatMessages(query, 8)
    ]);

    const results = readSettled(settled[0], [], "Local Search Error", requestId, query.length);
    const suggestions = readSettled(settled[1], [], "Suggestion Error", requestId, query.length);
    const webRaw = readSettled(settled[2], [], "Web Search Error", requestId, query.length);
    const conversationMatches = readSettled(
      settled[3],
      [],
      "Conversation Search Error",
      requestId,
      query.length
    );

    const webResults = webResultsToSearchResults(query, webRaw);
    const relevantResults = filterRelevantResults(query, results, 10);
    const relevantConversationMatches = filterRelevantResults(query, conversationMatches, 8);
    const network = await buildContextNetworkSafe(
      query,
      [...relevantConversationMatches, ...webResults],
      relevantResults,
      requestId
    );

    return NextResponse.json(
      apiSuccess(
        buildRelevantContextPayload({
          query,
          results,
          conversationMatches,
          webResults,
          suggestions,
          network
        }),
        requestId
      )
    );
  } catch (error) {
    console.error("[Context Query API]", {
      requestId,
      error,
      queryLength: 0
    });

    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process the context query."
        },
        requestId
      },
      { status: 500 }
    );
  }
}

function readSettled<T>(
  settled: PromiseSettledResult<T>,
  fallback: T,
  label: string,
  requestId: string,
  queryLength: number
): T {
  if (settled.status === "fulfilled") return settled.value;

  console.error(`[${label}]`, {
    requestId,
    error: settled.reason,
    queryLength
  });

  return fallback;
}

async function buildContextNetworkSafe(
  query: string,
  extraResults: SearchResult[],
  baseResults: SearchResult[],
  requestId: string
) {
  try {
    return await buildContextNetwork(query, extraResults, baseResults);
  } catch (error) {
    console.error("[Context Network Error]", {
      requestId,
      error,
      queryLength: query.length
    });

    return {
      nodes: [
        {
          id: "query",
          label: query,
          type: "query" as const,
          score: 1
        }
      ],
      edges: []
    };
  }
}
