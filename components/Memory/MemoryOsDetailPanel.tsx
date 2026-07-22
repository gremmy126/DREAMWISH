"use client";

import {
  Bookmark,
  CheckCircle2,
  Download,
  History,
  Link2,
  MessageSquareText,
  Share2,
  Sparkles
} from "lucide-react";
import { useState } from "react";
import {
  MEMORY_OS_TYPE_LABELS,
  type MemoryOsItem
} from "@/src/lib/memory-os/memory-os.types";
import { TYPE_STYLES } from "./memory-os-styles";

export type RelatedEntry = {
  id: string;
  title: string;
  type: MemoryOsItem["type"];
  status: MemoryOsItem["status"];
  project: string;
  score: number;
};

type DetailTab = "요약" | "상세 내용" | "연결 정보" | "히스토리";

type MemoryOsDetailPanelProps = {
  item: MemoryOsItem;
  related: RelatedEntry[];
  stars: number;
  busy: boolean;
  onPatch: (patch: Record<string, unknown>) => Promise<void>;
  onSummarize: () => Promise<void>;
  onOpenRelated: (memoryId: string) => void;
  onOpenChat: () => void;
  onNotice: (message: string) => void;
};

const STATUS_LABELS: Record<MemoryOsItem["status"], { label: string; className: string }> = {
  suggestion: { label: "AI 제안", className: "bg-[#fff3ec] text-[#ea7c2f]" },
  confirmed: { label: "확정됨", className: "bg-[#eefdf3] text-[#16a34a]" },
  archived: { label: "아카이브", className: "bg-app-soft text-app-muted" },
  expired: { label: "만료", className: "bg-app-soft text-app-muted" }
};

// 우측 Memory Detail 패널 — 레퍼런스 이미지의 요약/상세/연결/히스토리 탭 구조.
export function MemoryOsDetailPanel({
  item,
  related,
  stars,
  busy,
  onPatch,
  onSummarize,
  onOpenRelated,
  onOpenChat,
  onNotice
}: MemoryOsDetailPanelProps) {
  const [tab, setTab] = useState<DetailTab>("요약");
  const [editing, setEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(item.content);
  const typeStyle = TYPE_STYLES[item.type];

  function exportMarkdown() {
    const lines = [
      `# ${item.title}`,
      "",
      `- 타입: ${MEMORY_OS_TYPE_LABELS[item.type]} · 상태: ${STATUS_LABELS[item.status].label}`,
      `- 프로젝트: ${item.project || "-"} · 신뢰도: ${item.confidence}%`,
      `- 태그: ${item.tags.map((tag) => `#${tag}`).join(" ")}`,
      "",
      item.content,
      ""
    ];
    if (item.aiSummary) {
      lines.push("## AI Summary", ...item.aiSummary.threeLines.map((line) => `- ${line}`), "");
      lines.push(`핵심 결과: ${item.aiSummary.coreOutcome}`, "");
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `memory-${item.id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    const text = `${item.title}\n${item.aiSummary?.coreOutcome || item.description}`;
    try {
      await navigator.clipboard.writeText(text);
      onNotice("메모리 요약을 클립보드에 복사했습니다.");
    } catch {
      onNotice("클립보드 복사에 실패했습니다.");
    }
  }

  return (
    <aside className="flex h-full min-h-0 flex-col rounded-app border border-app-border bg-app-card shadow-app">
      <div className="border-b border-app-border p-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className="rounded-lg px-2 py-1 text-[10px] font-extrabold"
            style={{ backgroundColor: typeStyle.soft, color: typeStyle.color }}
          >
            {MEMORY_OS_TYPE_LABELS[item.type]}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onPatch({ favorite: !item.favorite })}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                item.favorite
                  ? "border-app-primary bg-app-hover text-app-primary"
                  : "border-app-border text-app-muted hover:text-app-primary"
              }`}
              aria-label="즐겨찾기"
            >
              <Bookmark size={14} fill={item.favorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <h2 className="mt-3 text-lg font-extrabold leading-7 text-app-text">{item.title}</h2>
        <dl className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <dt className="text-app-muted">프로젝트</dt>
            <dd className="max-w-[60%] truncate font-semibold text-app-text">
              {item.project || "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-app-muted">상태</dt>
            <dd>
              <span
                className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${STATUS_LABELS[item.status].className}`}
              >
                {STATUS_LABELS[item.status].label}
              </span>
            </dd>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <dt className="text-app-muted">신뢰도</dt>
              <dd className="font-extrabold text-app-primary">{item.confidence}%</dd>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-app-primary to-[#22c55e]"
                style={{ width: `${item.confidence}%` }}
              />
            </div>
          </div>
        </dl>
        {item.status === "suggestion" ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void onPatch({ status: "confirmed" })}
              className="h-9 flex-1 rounded-xl bg-app-primary text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
            >
              승인하여 확정
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onPatch({ status: "archived" })}
              className="h-9 rounded-xl border border-app-border px-3 text-xs font-semibold text-app-muted transition hover:bg-app-hover"
            >
              보관
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex border-b border-app-border px-5">
        {(["요약", "상세 내용", "연결 정보", "히스토리"] as DetailTab[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setTab(candidate)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-bold transition ${
              tab === candidate
                ? "border-app-primary text-app-primary"
                : "border-transparent text-app-muted hover:text-app-text"
            }`}
          >
            {candidate}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 app-scrollbar">
        {tab === "요약" ? (
          <>
            <section>
              <div className="flex items-center justify-between">
                <p className="text-xs font-extrabold text-app-text">핵심 내용</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSummarize()}
                  className="flex h-7 items-center gap-1 rounded-lg bg-app-hover px-2 text-[10px] font-bold text-app-primary transition hover:opacity-80 disabled:opacity-50"
                >
                  <Sparkles size={11} />
                  {item.aiSummary ? "AI 요약 갱신" : "AI 요약 생성"}
                </button>
              </div>
              {item.aiSummary ? (
                <ul className="mt-2 space-y-1.5">
                  {item.aiSummary.threeLines.map((line, index) => (
                    <li key={index} className="text-xs leading-5 text-app-text">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs leading-5 text-app-muted">{item.description}</p>
              )}
            </section>

            {item.aiSummary ? (
              <section className="rounded-2xl border border-[#e4defc] bg-gradient-to-br from-[#f5f3ff] to-white p-3.5">
                <p className="text-[10px] font-extrabold text-app-primary">핵심 결과</p>
                <p className="mt-1 text-xs font-bold leading-5 text-app-text">
                  {item.aiSummary.coreOutcome}
                </p>
              </section>
            ) : null}

            {item.aiSummary?.cautions.length ? (
              <section>
                <p className="text-xs font-extrabold text-app-text">주의할 점</p>
                <ul className="mt-1.5 space-y-1">
                  {item.aiSummary.cautions.map((caution, index) => (
                    <li key={index} className="text-[11px] leading-5 text-[#b45309]">
                      ⚠ {caution}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {item.aiSummary?.nextUse.length ? (
              <section>
                <p className="text-xs font-extrabold text-app-text">다음 의사결정에 사용</p>
                <ul className="mt-1.5 space-y-1">
                  {item.aiSummary.nextUse.map((entry, index) => (
                    <li key={index} className="flex items-start gap-1.5 text-[11px] leading-5 text-app-text">
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[#16a34a]" />
                      {entry}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {item.insights.length ? (
              <section>
                <p className="text-xs font-extrabold text-app-text">핵심 인사이트</p>
                <ul className="mt-1.5 space-y-1">
                  {item.insights.map((insight, index) => (
                    <li key={index} className="flex items-start gap-1.5 text-[11px] leading-5 text-app-text">
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-app-primary" />
                      {insight}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {item.tags.length ? (
              <section>
                <p className="text-xs font-extrabold text-app-text">관련 태그</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-lg bg-app-hover px-2 py-0.5 text-[10px] font-bold text-app-primary"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl bg-app-soft/60 p-3.5 text-[10.5px] sm:grid-cols-3">
              <MetaCell label="생성자" value={item.createdBy} />
              <MetaCell label="생성일" value={formatDate(item.createdAt)} />
              <MetaCell label="최종 수정" value={formatDate(item.updatedAt)} />
              <MetaCell label="사용 횟수" value={`${item.usageCount}회`} />
              <MetaCell label="관련 메모리" value={`${related.length}개`} />
              <MetaCell label="버전" value={`v${item.versions.length}.0 · ★${stars}`} />
            </section>
          </>
        ) : null}

        {tab === "상세 내용" ? (
          <section>
            {editing ? (
              <>
                <textarea
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  rows={14}
                  className="w-full rounded-2xl border border-app-border bg-app-card p-3 text-xs leading-6 text-app-text outline-none transition focus:border-app-primary"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void onPatch({ content: draftContent }).then(() => setEditing(false));
                    }}
                    className="h-9 rounded-xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
                  >
                    저장 (새 버전)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="h-9 rounded-xl border border-app-border px-3 text-xs font-semibold text-app-muted"
                  >
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="whitespace-pre-line text-xs leading-6 text-app-text">{item.content}</p>
                <button
                  type="button"
                  onClick={() => {
                    setDraftContent(item.content);
                    setEditing(true);
                  }}
                  className="mt-3 h-9 rounded-xl border border-app-border px-4 text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
                >
                  내용 수정
                </button>
              </>
            )}
          </section>
        ) : null}

        {tab === "연결 정보" ? (
          <section className="space-y-2">
            {related.length ? (
              related.map((entry) => {
                const style = TYPE_STYLES[entry.type];
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onOpenRelated(entry.id)}
                    className="flex w-full items-center gap-2.5 rounded-2xl border border-app-border bg-app-card p-3 text-left transition hover:border-app-primary/40 hover:bg-app-hover/40"
                  >
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold"
                      style={{ backgroundColor: style.soft, color: style.color }}
                    >
                      {MEMORY_OS_TYPE_LABELS[entry.type]}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-app-text">
                      {entry.title}
                    </span>
                    <Link2 size={12} className="shrink-0 text-app-muted" />
                  </button>
                );
              })
            ) : (
              <p className="text-xs text-app-muted">
                아직 의미적으로 연결된 메모리가 없습니다. 태그·프로젝트가 겹치면 자동으로
                연결됩니다.
              </p>
            )}
          </section>
        ) : null}

        {tab === "히스토리" ? (
          <section className="space-y-2">
            {[...item.versions].reverse().map((version) => (
              <div
                key={version.version}
                className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-card p-3"
              >
                <History size={13} className="shrink-0 text-app-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-app-text">
                    v{version.version} · {version.summary}
                  </p>
                  <p className="text-[10px] text-app-muted">
                    {version.editedBy === "ai" ? "AI 생성" : "사람 수정"} ·{" "}
                    {formatDate(version.editedAt)}
                  </p>
                </div>
                {version.version !== item.versions.length ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onPatch({ restoreVersion: version.version })}
                    className="h-7 shrink-0 rounded-lg border border-app-border px-2 text-[10px] font-bold text-app-muted transition hover:text-app-primary"
                  >
                    복원
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-app-primary">현재</span>
                )}
              </div>
            ))}
          </section>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-app-border p-4">
        <button
          type="button"
          onClick={() => void share()}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-app-border px-3 text-[11px] font-bold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
        >
          <Share2 size={12} />
          공유
        </button>
        <button
          type="button"
          onClick={exportMarkdown}
          className="flex h-9 items-center gap-1.5 rounded-xl border border-app-border px-3 text-[11px] font-bold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
        >
          <Download size={12} />
          내보내기
        </button>
        <button
          type="button"
          onClick={onOpenChat}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-xl bg-app-primary px-3.5 text-[11px] font-bold text-white shadow-soft transition hover:opacity-90"
        >
          <MessageSquareText size={12} />
          연결된 대화 열기
        </button>
      </div>
    </aside>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-bold text-app-muted">{label}</p>
      <p className="mt-0.5 truncate font-extrabold text-app-text">{value}</p>
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}
