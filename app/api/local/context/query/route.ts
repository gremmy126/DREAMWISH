import { NextResponse } from "next/server";
import { suggestConnectionsForQuery } from "@/src/lib/connections/connections.service";
import {
  buildRelevantContextPayload,
  filterRelevantResults,
  shouldUseExternalWebContext
} from "@/src/lib/context/relevance";
import { searchChatMessages } from "@/src/lib/db/repositories/chat.repository";
import { buildContextNetwork } from "@/src/lib/network/network.service";
import { hybridSearchResults } from "@/src/lib/search/search.service";
import { searchWeb, webResultsToSearchResults } from "@/src/lib/web-search/web-search.service";

export async function POST(request: Request) {
  const body = await request.json();
  const query = String(body.query || "");
  const [results, suggestions, webRaw, conversationMatches] = await Promise.all([
    hybridSearchResults(query, 12),
    suggestConnectionsForQuery(query),
    shouldUseExternalWebContext(query) ? searchWeb(query, 6).catch(() => []) : Promise.resolve([]),
    searchChatMessages(query, 8)
  ]);
  const webResults = webResultsToSearchResults(query, webRaw);
  const relevantResults = filterRelevantResults(query, results, 10);
  const network = await buildContextNetwork(query, webResults, relevantResults);

  return NextResponse.json(buildRelevantContextPayload({
    query,
    results,
    conversationMatches,
    webResults,
    suggestions,
    network
  }));
}
