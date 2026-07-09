import { ExternalLink } from "lucide-react";
import type { SearchResult } from "@/src/lib/search/search.types";

export function ResultList({
  results,
  emptyText,
  onPreview
}: {
  results: SearchResult[];
  emptyText: string;
  onPreview?: (result: SearchResult) => void;
}) {
  if (results.length === 0) {
    return <p className="text-xs leading-5 text-app-muted">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      {results.slice(0, 5).map((result) => (
        <button
          key={`${result.path}-${result.matchedBy}`}
          type="button"
          onClick={() => onPreview?.(result)}
          className="w-full rounded-2xl border border-app-border bg-app-bg px-3 py-3 text-left transition hover:bg-app-hover"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-app-text">
              {result.title}
            </p>
            <span className="shrink-0 text-[11px] font-semibold text-app-primary">
              {result.sourceType === "web" ? "WEB" : `${Math.round(result.score * 100)}%`}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-app-muted">
            {result.sourceType === "web" ? <ExternalLink size={11} /> : null}
            <span className="truncate">{result.url || result.path}</span>
          </p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">
            {result.snippet}
          </p>
        </button>
      ))}
    </div>
  );
}
