import type { AIMessage } from "../ai/ai-provider";
import { searchWeb } from "./web-search.service";
import type { WebSearchResult } from "./web-search.types";

export type WebSearchOutcome = {
  results: WebSearchResult[];
  degraded: boolean;
  warning: string | null;
};

export async function searchWebSafely(
  query: string,
  search: (query: string) => Promise<WebSearchResult[]> = searchWeb
): Promise<WebSearchOutcome> {
  try {
    return { results: await search(query), degraded: false, warning: null };
  } catch {
    return {
      results: [],
      degraded: true,
      warning: "Live web search is temporarily unavailable. The answer below is not web-verified."
    };
  }
}

export function buildUnverifiedWebFallbackMessages(
  question: string,
  warning = "No usable live web sources were found."
): AIMessage[] {
  return [
    {
      role: "system",
      content: [
        "Answer from general model knowledge because live web evidence is unavailable.",
        "Clearly state that current facts could not be verified.",
        "Do not invent citations, URLs, dates, prices, or breaking-news claims.",
        warning
      ].join(" ")
    },
    { role: "user", content: question }
  ];
}
