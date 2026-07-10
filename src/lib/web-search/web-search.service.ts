import type { SearchResult } from "@/src/lib/search/search.types";
import { normalizeSearchText, safeExternalUrl } from "@/src/lib/search/search-text";
import type { WebSearchResult } from "./web-search.types";

type DuckDuckGoTopic = {
  Text?: string;
  FirstURL?: string;
  Name?: string;
  Topics?: DuckDuckGoTopic[];
};

const REQUEST_HEADERS = {
  Accept: "text/html,application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 DREAMWISH/0.1"
};

export async function searchWeb(query: string, limit = 8): Promise<WebSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const errors: string[] = [];

  try {
    const results = await searchDuckDuckGoInstant(trimmed);
    if (results.length > 0) return results.slice(0, limit);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "DuckDuckGo 검색 실패");
  }

  try {
    const results = await searchBingHtml(trimmed);
    if (results.length > 0) return results.slice(0, limit);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Bing 검색 실패");
  }

  if (errors.length > 0) {
    throw new Error(`웹 검색 결과를 가져오지 못했습니다. ${errors.join(" / ")}`);
  }

  return [];
}

export function webResultsToSearchResults(
  query: string,
  results: WebSearchResult[]
): SearchResult[] {
  return results.map((rawResult, index) => {
    const result = normalizeWebSearchResult(rawResult);
    return {
    documentId: result.url || `web:${query}:${index}`,
    title: result.title || "웹 검색 결과",
    path: result.url || "web",
    url: result.url,
    snippet: result.snippet,
    score: Number(Math.max(0.45, 0.94 - index * 0.06).toFixed(2)),
    matchedBy: "web",
    sourceType: "web",
    updatedAt: ""
    };
  });
}

export function normalizeWebSearchResult(result: WebSearchResult): WebSearchResult {
  return {
    title: normalizeSearchText(result.title || "웹 검색 결과"),
    url: safeExternalUrl(result.url || ""),
    snippet: normalizeSearchText(result.snippet || "")
  };
}

async function searchDuckDuckGoInstant(query: string): Promise<WebSearchResult[]> {
  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo 응답 오류: ${response.status}`);
  }

  const raw = await response.text();
  if (!raw.trim()) {
    throw new Error("DuckDuckGo가 빈 응답을 반환했습니다.");
  }

  const data = JSON.parse(raw);
  const topics = flattenTopics(data.RelatedTopics || []);

  return [
    data.AbstractText
      ? {
          title: normalizeSearchText(data.Heading || query),
          url: safeExternalUrl(data.AbstractURL || ""),
          snippet: normalizeSearchText(data.AbstractText)
        }
      : null,
    ...topics.map((topic) => ({
      title: normalizeSearchText(topic.Text?.split(" - ")[0] || topic.Name || "검색 결과"),
      url: safeExternalUrl(topic.FirstURL || ""),
      snippet: normalizeSearchText(topic.Text || "")
    }))
  ].filter(Boolean) as WebSearchResult[];
}

async function searchBingHtml(query: string): Promise<WebSearchResult[]> {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: REQUEST_HEADERS,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Bing 응답 오류: ${response.status}`);
  }

  const html = await response.text();
  const blocks = html.split(/<li class="b_algo"[^>]*>/i).slice(1);
  const results: WebSearchResult[] = [];

  for (const block of blocks) {
    const titleMatch = block.match(
      /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i
    );
    if (!titleMatch) continue;

    const snippetMatch = block.match(
      /<div[^>]+class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i
    );
    const title = normalizeSearchText(titleMatch[2]);
    const resultUrl = normalizeBingUrl(titleMatch[1]);
    const snippet = snippetMatch ? cleanHtml(snippetMatch[1]) : "";

    if (title && resultUrl) {
      results.push({ title, url: resultUrl, snippet });
    }

    if (results.length >= 8) break;
  }

  return results;
}

function flattenTopics(topics: DuckDuckGoTopic[]): DuckDuckGoTopic[] {
  return topics
    .flatMap((topic) => [
      topic.Text ? topic : null,
      ...(topic.Topics ? flattenTopics(topic.Topics) : [])
    ])
    .filter(Boolean) as DuckDuckGoTopic[];
}

function normalizeBingUrl(value: string) {
  try {
    const parsed = new URL(normalizeSearchText(value));
    const encodedTarget = parsed.searchParams.get("u");
    if (encodedTarget?.startsWith("a1")) {
      const decoded = Buffer.from(encodedTarget.slice(2), "base64").toString("utf8");
      const url = safeExternalUrl(decoded);
      if (url) return url;
    }
  } catch {
    return safeExternalUrl(value);
  }

  return safeExternalUrl(value);
}

function cleanHtml(value: string) {
  return normalizeSearchText(value);
}
