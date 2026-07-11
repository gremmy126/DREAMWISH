"use client";

import { Check, Clock3, Pencil, X } from "lucide-react";
import { useState } from "react";
import type { AppLanguage } from "@/src/lib/i18n/translations";
import type { MemoryCandidate } from "@/src/lib/memory/memory.types";

export type MemoryCandidateCardData = Pick<
  MemoryCandidate,
  | "id"
  | "title"
  | "content"
  | "preview"
  | "version"
  | "category"
  | "importance"
  | "recency"
  | "frequency"
  | "confidence"
>;

export function MemoryCandidateCard({
  candidate,
  language,
  busy,
  onApprove,
  onReject,
  onDefer
}: {
  candidate: MemoryCandidateCardData;
  language: AppLanguage;
  busy: boolean;
  onApprove: (content: string) => void;
  onReject: () => void;
  onDefer: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(candidate.content);
  const expectedVersion = candidate.version;
  const labels = candidateLabels(language);

  return (
    <article className="rounded-app border border-app-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-app-text">{candidate.title}</p>
          <p className="mt-1 text-[11px] text-app-muted">
            {candidate.category || labels.uncategorized} · v{expectedVersion}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          disabled={busy}
          className="inline-flex h-8 items-center gap-1 rounded-xl border border-app-border px-2 text-[11px] font-semibold text-app-muted"
        >
          <Pencil size={12} />
          {labels.edit}
        </button>
      </div>

      {editing ? (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          className="mt-3 w-full resize-y rounded-2xl border border-app-border bg-app-bg p-3 text-xs leading-5 text-app-text outline-none focus:border-app-primary"
        />
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">
          {candidate.preview}
        </p>
      )}

      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] font-semibold text-app-muted">
        <Score label={labels.importance} value={candidate.importance} />
        <Score label={labels.recency} value={candidate.recency} />
        <Score label={labels.frequency} value={candidate.frequency} raw />
        <Score label={labels.confidence} value={candidate.confidence} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onApprove(content)}
          disabled={busy || !content.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-xl bg-app-primary px-3 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          <Check size={13} />
          {labels.approve}
        </button>
        <button
          type="button"
          onClick={onDefer}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1 rounded-xl border border-app-border px-3 text-[11px] font-semibold text-app-muted"
        >
          <Clock3 size={13} />
          {labels.defer}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="inline-flex h-9 items-center gap-1 rounded-xl border border-red-200 px-3 text-[11px] font-semibold text-red-600"
        >
          <X size={13} />
          {labels.reject}
        </button>
      </div>
    </article>
  );
}

function Score({ label, value, raw = false }: { label: string; value: number; raw?: boolean }) {
  return (
    <div className="rounded-2xl bg-app-bg px-3 py-2">
      <p>{label}</p>
      <p className="mt-1 text-app-text">{raw ? value : `${Math.round(value * 100)}%`}</p>
    </div>
  );
}

function candidateLabels(language: AppLanguage) {
  if (language === "en") {
    return { edit: "Edit", approve: "Approve", defer: "Review later", reject: "Reject", uncategorized: "Uncategorized", importance: "Importance", recency: "Recency", frequency: "Frequency", confidence: "Confidence" };
  }
  if (language === "ja") {
    return { edit: "編集", approve: "承認", defer: "後で確認", reject: "拒否", uncategorized: "未分類", importance: "重要度", recency: "新しさ", frequency: "頻度", confidence: "信頼度" };
  }
  return { edit: "편집", approve: "검토 후 승인", defer: "나중에 검토", reject: "거절", uncategorized: "미분류", importance: "중요도", recency: "최신성", frequency: "빈도", confidence: "신뢰도" };
}
