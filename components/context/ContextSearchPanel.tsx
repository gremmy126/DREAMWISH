"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { PanelShell } from "@/components/context/PanelShell";
import { ResultList } from "@/components/context/ResultList";
import type { ContextPayload } from "@/components/context/types";
import { readApiResponse } from "@/src/lib/api/api-response";
import type { SearchResult } from "@/src/lib/search/search.types";

export function ContextSearchPanel({
  initialQuery,
  initialResults,
  onPreview
}: {
  initialQuery: string;
  initialResults: SearchResult[];
  onPreview: (result: SearchResult) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>(initialResults);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(initialQuery);
    setResults(initialResults);
  }, [initialQuery, initialResults]);

  async function runSearch() {
    if (!query.trim()) return;
    setLoading(true);

    try {
      const response = await fetch("/api/local/context/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await readApiResponse<ContextPayload>(response);
      setResults(data.conversationMatches || []);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PanelShell title="맥락 검색" icon={Search}>
      <div className="mb-3 flex gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
          className="min-w-0 flex-1 rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-xs outline-none focus:border-app-primary"
          placeholder="대화 기록에서 검색"
        />
        <button
          type="button"
          onClick={() => void runSearch()}
          className="rounded-2xl bg-app-primary px-3 py-2 text-xs font-semibold text-white"
        >
          {loading ? "검색 중" : "검색"}
        </button>
      </div>
      <ResultList
        results={results}
        emptyText="현재 대화 기록에서 찾은 맥락이 없습니다."
        onPreview={onPreview}
      />
    </PanelShell>
  );
}
