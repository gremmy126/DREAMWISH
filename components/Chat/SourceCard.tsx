"use client";

import { ExternalLink, FileText } from "lucide-react";
import type { SourceDocument } from "@/src/lib/chat/chat.types";

type SourceCardProps = {
  source: SourceDocument;
};

export function SourceCard({ source }: SourceCardProps) {
  return (
    <article className="rounded-app border border-app-border bg-app-card p-4 shadow-soft">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <FileText size={16} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-app-text">
              {source.title}
            </h3>
            <p className="mt-1 truncate text-xs text-app-muted">{source.path}</p>
          </div>
        </div>
        <button
          type="button"
          disabled
          title="데스크톱 파일 열기 연결 전"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-bg text-slate-400"
          aria-label="열기"
        >
          <ExternalLink size={14} />
        </button>
      </div>

      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-app-primary">
          관련도 {Math.round(source.relevance * 100)}%
        </span>
        <span className="text-app-muted">
          수정일 {source.updated || "알 수 없음"}
        </span>
      </div>

      <p className="line-clamp-4 text-xs leading-5 text-slate-600">
        {source.preview}
      </p>
    </article>
  );
}
