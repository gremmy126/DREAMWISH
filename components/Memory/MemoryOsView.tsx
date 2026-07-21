"use client";

import {
  Archive,
  Clock,
  Download,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Network,
  Plus,
  Search,
  Sparkles,
  Star,
  Upload,
  Wand2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigateWorkspace } from "@/components/decisions/useDecisions";
import {
  MEMORY_OS_TYPE_LABELS,
  MEMORY_OS_TYPES,
  type MemoryOsItem,
  type MemoryOsOverview,
  type MemoryOsStatus,
  type MemoryOsType
} from "@/src/lib/memory-os/memory-os.types";
import { MemoryOsDetailPanel, type RelatedEntry } from "./MemoryOsDetailPanel";
import { TYPE_STYLES } from "./memory-os-styles";

type ListItem = Omit<MemoryOsItem, "content" | "versions"> & {
  relatedCount: number;
  stars: number;
};

type ViewMode = "list" | "card" | "timeline" | "knowledge";
type StatusFilter = "all" | MemoryOsStatus | "favorite";

const STATUS_CHIPS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "confirmed", label: "확정됨" },
  { id: "suggestion", label: "AI 제안" },
  { id: "archived", label: "아카이브" },
  { id: "favorite", label: "즐겨찾기" }
];

const STATUS_BADGES: Record<MemoryOsStatus, { label: string; className: string }> = {
  suggestion: { label: "AI 제안", className: "bg-[#fff3ec] text-[#ea7c2f]" },
  confirmed: { label: "확정됨", className: "bg-[#eefdf3] text-[#16a34a]" },
  archived: { label: "아카이브", className: "bg-app-soft text-app-muted" },
  expired: { label: "만료", className: "bg-app-soft text-app-muted" }
};

const PAGE_SIZE = 10;

// DreamWish Memory OS — AI의 장기 기억이자 조직의 의사결정 자산.
// 레퍼런스: 사용자 제공 Memory 디자인 이미지 (흰 배경, KPI, 타입 분포,
// 리스트 + 우측 상세 패널, 4가지 보기 방식).
export function MemoryOsView() {
  const [items, setItems] = useState<ListItem[]>([]);
  const [overview, setOverview] = useState<MemoryOsOverview | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<MemoryOsType | "">("");
  const [sort, setSort] = useState<"latest" | "usage" | "confidence">("latest");
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    item: MemoryOsItem;
    related: RelatedEntry[];
    stars: number;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(
    async (overrides: { q?: string; status?: StatusFilter; type?: MemoryOsType | ""; sort?: string } = {}) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        const q = overrides.q ?? query;
        const status = overrides.status ?? statusFilter;
        const type = overrides.type ?? typeFilter;
        if (q.trim()) params.set("q", q.trim());
        if (status === "favorite") params.set("favorite", "1");
        else if (status !== "all") params.set("status", status);
        if (type) params.set("type", type);
        params.set("sort", overrides.sort ?? sort);
        const response = await fetch(`/api/memory-os?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) throw new Error("메모리를 불러오지 못했습니다.");
        const body = (await response.json()) as { items: ListItem[]; overview: MemoryOsOverview };
        setItems(body.items || []);
        setOverview(body.overview || null);
        setPage(1);
      } catch (caught) {
        const raw = caught instanceof Error ? caught.message : "";
        setNotice(
          raw === "Failed to fetch"
            ? "서버에 연결하지 못했습니다. 개발 서버가 실행 중인지 확인한 뒤 잠시 후 다시 시도하세요."
            : raw || "메모리를 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [query, statusFilter, typeFilter, sort]
  );

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(value: string) {
    setQuery(value);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(() => {
      void reload({ q: value });
    }, 350);
  }

  async function openDetail(memoryId: string) {
    try {
      const response = await fetch(`/api/memory-os/${memoryId}`, { cache: "no-store" });
      if (!response.ok) throw new Error("메모리를 열지 못했습니다.");
      const body = (await response.json()) as {
        item: MemoryOsItem;
        related: RelatedEntry[];
        stars: number;
      };
      setDetail({ item: body.item, related: body.related || [], stars: body.stars || 1 });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "메모리를 열지 못했습니다.");
    }
  }

  async function patchDetail(patch: Record<string, unknown>) {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/memory-os/${detail.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = (await response.json().catch(() => ({}))) as { item?: MemoryOsItem };
      if (!response.ok || !body.item) throw new Error("저장하지 못했습니다.");
      setDetail({ ...detail, item: body.item });
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function summarizeDetail() {
    if (!detail) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/memory-os/${detail.item.id}/summarize`, {
        method: "POST"
      });
      const body = (await response.json().catch(() => ({}))) as { item?: MemoryOsItem };
      if (!response.ok || !body.item) throw new Error("AI 요약을 생성하지 못했습니다.");
      setDetail({ ...detail, item: body.item });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "AI 요약을 생성하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "dreamwish-memories.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text()) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) throw new Error("JSON 배열 형식이 아닙니다.");
      let created = 0;
      for (const entry of parsed.slice(0, 50)) {
        const response = await fetch("/api/memory-os", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: entry.title,
            content: entry.content || entry.description || entry.title,
            type: entry.type,
            project: entry.project,
            tags: entry.tags
          })
        });
        if (response.ok) created += 1;
      }
      setNotice(`${created}개의 메모리를 가져왔습니다.`);
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "가져오기에 실패했습니다.");
    }
  }

  const paged = useMemo(
    () => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [items, page]
  );
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  return (
    <div className="pt-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
          event.target.value = "";
        }}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-app-text sm:text-2xl">Memory</h1>
          <p className="mt-1 text-xs text-app-muted">
            AI와 조직의 모든 지식을 연결하여 더 나은 결정을 만들어보세요.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 w-72 max-w-full items-center gap-2 rounded-2xl border border-app-border bg-white px-3 shadow-soft">
            <Search size={15} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="메모리 검색 (자연어, 키워드, 태그...)"
              className="min-w-0 flex-1 bg-transparent text-xs text-app-text outline-none placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex h-10 items-center gap-1.5 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90"
          >
            <Plus size={14} />새 메모리
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3.5 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
          >
            <Upload size={14} />
            가져오기
          </button>
          <button
            type="button"
            onClick={exportAll}
            className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3.5 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
          >
            <Download size={14} />
            내보내기
          </button>
        </div>
      </div>

      {notice ? (
        <p className="mb-3 rounded-2xl border border-app-border bg-app-hover px-4 py-2.5 text-xs font-semibold text-app-primary">
          {notice}
        </p>
      ) : null}

      {overview ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              icon={<Sparkles size={16} />}
              label="전체 메모리"
              value={overview.kpis.total}
              delta={overview.kpis.deltas.total}
            />
            <KpiCard
              icon={<Star size={16} />}
              label="확정된 메모리"
              value={overview.kpis.confirmed}
              delta={overview.kpis.deltas.confirmed}
            />
            <KpiCard
              icon={<Wand2 size={16} />}
              label="AI 제안 대기"
              value={overview.kpis.suggestions}
              delta={overview.kpis.deltas.suggestions}
            />
            <KpiCard
              icon={<Archive size={16} />}
              label="아카이브"
              value={overview.kpis.archived}
              delta={overview.kpis.deltas.archived}
            />
          </div>

          {overview.distribution.length ? (
            <div className="mb-4">
              <p className="mb-2 text-xs font-extrabold text-app-text">메모리 타입별 분포</p>
              <div className="flex gap-3 overflow-x-auto pb-1 app-scrollbar">
                {overview.distribution.map((entry) => {
                  const style = TYPE_STYLES[entry.type];
                  return (
                    <button
                      key={entry.type}
                      type="button"
                      onClick={() => {
                        const next = typeFilter === entry.type ? "" : entry.type;
                        setTypeFilter(next);
                        void reload({ type: next });
                      }}
                      className={`w-40 shrink-0 rounded-2xl border bg-white p-3.5 text-left shadow-soft transition hover:-translate-y-0.5 ${
                        typeFilter === entry.type ? "border-app-primary" : "border-app-border"
                      }`}
                    >
                      <p className="text-[11px] font-bold" style={{ color: style.color }}>
                        {MEMORY_OS_TYPE_LABELS[entry.type]}
                      </p>
                      <p className="mt-1 text-xl font-extrabold text-app-text">{entry.count}</p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${entry.percent}%`, backgroundColor: style.color }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] font-semibold text-app-muted">
                        {entry.percent}%
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {(overview.patterns.length || overview.insights.mostValuable) && items.length ? (
            <div className="mb-4 grid gap-3 lg:grid-cols-2">
              {overview.patterns.length ? (
                <div className="rounded-2xl border border-[#f9d8ea] bg-[#fdf7fb] p-4">
                  <p className="text-xs font-extrabold text-[#ec4899]">패턴 감지</p>
                  <ul className="mt-1.5 space-y-1">
                    {overview.patterns.map((pattern) => (
                      <li key={pattern.id} className="text-[11px] leading-5 text-app-text">
                        <b>{pattern.title}</b> — {pattern.description}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-2xl border border-app-border bg-white p-4 shadow-soft">
                <p className="text-xs font-extrabold text-app-text">Memory Insight</p>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-app-muted">
                  {overview.insights.mostUsed ? (
                    <li>
                      가장 많이 사용: <b className="text-app-text">{overview.insights.mostUsed.title}</b>{" "}
                      ({overview.insights.mostUsed.usageCount}회)
                    </li>
                  ) : null}
                  {overview.insights.mostConnected ? (
                    <li>
                      가장 많이 연결:{" "}
                      <b className="text-app-text">{overview.insights.mostConnected.title}</b> (
                      {overview.insights.mostConnected.relatedCount}개)
                    </li>
                  ) : null}
                  {overview.insights.mostValuable ? (
                    <li>
                      가장 가치 높은:{" "}
                      <b className="text-app-text">{overview.insights.mostValuable.title}</b>
                    </li>
                  ) : null}
                  {overview.insights.aiPick ? (
                    <li>
                      AI 추천: <b className="text-app-primary">{overview.insights.aiPick.title}</b> —{" "}
                      {overview.insights.aiPick.reason}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setStatusFilter(chip.id);
                void reload({ status: chip.id });
              }}
              className={`h-8 rounded-xl px-3 text-[11px] font-bold transition ${
                statusFilter === chip.id
                  ? "bg-app-primary text-white shadow-soft"
                  : "border border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
              }`}
            >
              {chip.label}
            </button>
          ))}
          <select
            value={typeFilter}
            onChange={(event) => {
              const next = event.target.value as MemoryOsType | "";
              setTypeFilter(next);
              void reload({ type: next });
            }}
            className="h-8 rounded-xl border border-app-border bg-white px-2 text-[11px] font-semibold text-app-muted"
          >
            <option value="">모든 타입</option>
            {MEMORY_OS_TYPES.map((type) => (
              <option key={type} value={type}>
                {MEMORY_OS_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={sort}
            onChange={(event) => {
              const next = event.target.value as typeof sort;
              setSort(next);
              void reload({ sort: next });
            }}
            className="h-8 rounded-xl border border-app-border bg-white px-2 text-[11px] font-semibold text-app-muted"
          >
            <option value="latest">정렬: 최신순</option>
            <option value="usage">정렬: 사용순</option>
            <option value="confidence">정렬: 신뢰도순</option>
          </select>
          <ViewToggle icon={ListIcon} active={view === "list"} onClick={() => setView("list")} label="리스트" />
          <ViewToggle icon={LayoutGrid} active={view === "card"} onClick={() => setView("card")} label="카드" />
          <ViewToggle icon={Clock} active={view === "timeline"} onClick={() => setView("timeline")} label="타임라인" />
          <ViewToggle icon={Network} active={view === "knowledge"} onClick={() => setView("knowledge")} label="지식 연결" />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-16 animate-pulse rounded-2xl bg-app-soft" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              onCreate={() => setCreating(true)}
              onSample={async () => {
                await fetch("/api/memory-os", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: "예시: 신제품은 파일럿 이후 확장이 성공률이 높다",
                    content:
                      "과거 결정에서 전면 출시보다 파일럿 후 확장이 성공 확률이 높았다. 다음 신제품 결정 시 파일럿 옵션을 반드시 비교하라.",
                    type: "lesson",
                    project: "온보딩",
                    tags: ["파일럿", "신제품"]
                  })
                });
                await reload();
              }}
            />
          ) : view === "list" ? (
            <ListView items={paged} onOpen={openDetail} selectedId={detail?.item.id || null} />
          ) : view === "card" ? (
            <CardView items={paged} onOpen={openDetail} />
          ) : view === "timeline" ? (
            <TimelineView items={items} onOpen={openDetail} />
          ) : (
            <KnowledgeView
              items={items}
              detail={detail}
              onOpen={openDetail}
            />
          )}

          {!loading && items.length > PAGE_SIZE && (view === "list" || view === "card") ? (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                <button
                  key={number}
                  type="button"
                  onClick={() => setPage(number)}
                  className={`h-8 w-8 rounded-xl text-[11px] font-bold transition ${
                    page === number
                      ? "bg-app-primary text-white shadow-soft"
                      : "border border-app-border bg-white text-app-muted hover:bg-app-hover"
                  }`}
                >
                  {number}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {detail ? (
          <div className="xl:sticky xl:top-[84px] xl:h-[calc(100dvh-120px)]">
            <MemoryOsDetailPanel
              item={detail.item}
              related={detail.related}
              stars={detail.stars}
              busy={busy}
              onPatch={patchDetail}
              onSummarize={summarizeDetail}
              onOpenRelated={(memoryId) => void openDetail(memoryId)}
              onOpenChat={() => navigateWorkspace("chat")}
              onNotice={setNotice}
            />
          </div>
        ) : null}
      </div>

      {creating ? (
        <NewMemoryModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  label,
  value,
  delta
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  delta: number;
}) {
  return (
    <div className="rounded-2xl border border-app-border bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-app-hover text-app-primary">
          {icon}
        </span>
        <p className="text-[11px] font-bold text-app-muted">{label}</p>
      </div>
      <p className="mt-2 text-xl font-extrabold text-app-text sm:text-2xl">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[10px] font-bold text-[#16a34a]">
        {delta > 0 ? `+${delta} 지난 30일` : "지난 30일 변화 없음"}
      </p>
    </div>
  );
}

function ViewToggle({
  icon: Icon,
  active,
  onClick,
  label
}: {
  icon: typeof ListIcon;
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
        active
          ? "bg-app-primary text-white shadow-soft"
          : "border border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
      }`}
    >
      <Icon size={14} />
    </button>
  );
}

function TypeChip({ type }: { type: MemoryOsType }) {
  const style = TYPE_STYLES[type];
  return (
    <span
      className="rounded-lg px-2 py-0.5 text-[10px] font-extrabold"
      style={{ backgroundColor: style.soft, color: style.color }}
    >
      {MEMORY_OS_TYPE_LABELS[type]}
    </span>
  );
}

function Stars({ count }: { count: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((index) => (
        <Star
          key={index}
          size={11}
          className={index <= count ? "text-[#f59e0b]" : "text-slate-200"}
          fill={index <= count ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

function RowIcon({ type }: { type: MemoryOsType }) {
  const style = TYPE_STYLES[type];
  const Icon = style.icon;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: style.soft, color: style.color }}
    >
      <Icon size={16} />
    </span>
  );
}

function ListView({
  items,
  onOpen,
  selectedId
}: {
  items: ListItem[];
  onOpen: (id: string) => void;
  selectedId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-app border border-app-border bg-white shadow-soft">
      <div className="hidden grid-cols-[minmax(0,1fr)_88px_120px_76px_84px_92px] gap-3 border-b border-app-border px-4 py-2.5 text-[10px] font-bold text-app-muted lg:grid">
        <span>메모리</span>
        <span>타입</span>
        <span>프로젝트</span>
        <span>상태</span>
        <span>생성일</span>
        <span>관련도</span>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.id)}
          className={`group relative grid w-full grid-cols-1 gap-2 border-b border-app-border px-4 py-3 text-left transition last:border-b-0 lg:grid-cols-[minmax(0,1fr)_88px_120px_76px_84px_92px] lg:items-center lg:gap-3 ${
            selectedId === item.id ? "bg-app-hover/60" : "hover:bg-app-hover/40"
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <RowIcon type={item.type} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-app-text">
                {item.title}
              </span>
              <span className="block truncate text-[11px] text-app-muted">{item.description}</span>
              {item.tags.length ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-[10px] font-semibold text-app-primary">
                      #{tag}
                    </span>
                  ))}
                  {item.tags.length > 3 ? (
                    <span className="text-[10px] font-semibold text-app-muted">
                      +{item.tags.length - 3}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
          </span>
          <span>
            <TypeChip type={item.type} />
          </span>
          <span className="truncate text-[11px] font-semibold text-app-text">
            {item.project || "—"}
          </span>
          <span>
            <span
              className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGES[item.status].className}`}
            >
              {STATUS_BADGES[item.status].label}
            </span>
          </span>
          <span className="text-[11px] text-app-muted">{formatShortDate(item.createdAt)}</span>
          <span className="flex items-center justify-between gap-1">
            <Stars count={item.stars} />
            <MoreHorizontal size={14} className="text-app-muted" />
          </span>

          <span className="pointer-events-none absolute left-16 top-full z-20 hidden w-72 -translate-y-1 rounded-2xl border border-app-border bg-white p-3 shadow-app group-hover:lg:block">
            <span className="block text-[11px] font-bold text-app-text">{item.title}</span>
            <span className="mt-1 block text-[10.5px] leading-4 text-app-muted">
              {item.description}
            </span>
            <span className="mt-1.5 block text-[10px] font-bold text-app-primary">
              신뢰도 {item.confidence}% · 관련 {item.relatedCount}개 ·{" "}
              {item.project || "프로젝트 없음"}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function CardView({ items, onOpen }: { items: ListItem[]; onOpen: (id: string) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item.id)}
          className="rounded-app border border-app-border bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-app-primary/40"
        >
          <div className="flex items-center justify-between gap-2">
            <TypeChip type={item.type} />
            <span
              className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGES[item.status].className}`}
            >
              {STATUS_BADGES[item.status].label}
            </span>
          </div>
          <p className="mt-2.5 line-clamp-2 text-[13px] font-bold leading-5 text-app-text">
            {item.title}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-app-muted">
            {item.description}
          </p>
          <div className="mt-3 flex items-center justify-between text-[10px] text-app-muted">
            <span>{formatShortDate(item.createdAt)}</span>
            <Stars count={item.stars} />
          </div>
        </button>
      ))}
    </div>
  );
}

function TimelineView({ items, onOpen }: { items: ListItem[]; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const buckets: Array<{ label: string; items: ListItem[] }> = [
      { label: "오늘", items: [] },
      { label: "어제", items: [] },
      { label: "이번 주", items: [] },
      { label: "이번 달", items: [] },
      { label: "올해", items: [] },
      { label: "이전", items: [] }
    ];
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (const item of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const time = Date.parse(item.createdAt);
      if (time >= startOfDay) buckets[0].items.push(item);
      else if (time >= startOfDay - 86_400_000) buckets[1].items.push(item);
      else if (time >= startOfDay - 6 * 86_400_000) buckets[2].items.push(item);
      else if (
        new Date(time).getMonth() === now.getMonth() &&
        new Date(time).getFullYear() === now.getFullYear()
      )
        buckets[3].items.push(item);
      else if (new Date(time).getFullYear() === now.getFullYear()) buckets[4].items.push(item);
      else buckets[5].items.push(item);
    }
    return buckets.filter((bucket) => bucket.items.length);
  }, [items]);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-extrabold text-app-text">{group.label}</p>
          <div className="space-y-2 border-l-2 border-app-border pl-4">
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item.id)}
                className="relative flex w-full items-center gap-3 rounded-2xl border border-app-border bg-white p-3 text-left shadow-soft transition hover:border-app-primary/40"
              >
                <span
                  className="absolute -left-[23px] h-3 w-3 rounded-full border-2 border-white"
                  style={{ backgroundColor: TYPE_STYLES[item.type].color }}
                />
                <RowIcon type={item.type} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-app-text">{item.title}</span>
                  <span className="block truncate text-[10.5px] text-app-muted">
                    {item.description}
                  </span>
                </span>
                <TypeChip type={item.type} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KnowledgeView({
  items,
  detail,
  onOpen
}: {
  items: ListItem[];
  detail: { item: MemoryOsItem; related: RelatedEntry[] } | null;
  onOpen: (id: string) => void;
}) {
  const groupsOrder: Array<{ label: string; types: MemoryOsType[] }> = [
    { label: "관련 메모리", types: ["knowledge", "idea", "meeting", "question", "pattern", "policy"] },
    { label: "관련 리서치", types: ["research", "market", "competitor", "customer"] },
    { label: "관련 결정", types: ["decision"] },
    { label: "관련 시뮬레이션", types: ["simulation", "risk"] },
    { label: "관련 결과·교훈", types: ["outcome", "lesson"] }
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="max-h-[560px] space-y-1.5 overflow-y-auto rounded-app border border-app-border bg-white p-2.5 shadow-soft app-scrollbar">
        <p className="px-1.5 pb-1 text-[10px] font-extrabold text-app-muted">
          메모리를 선택하면 의미적 연결이 펼쳐집니다
        </p>
        {items.slice(0, 30).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.id)}
            className={`flex w-full items-center gap-2 rounded-xl p-2 text-left transition ${
              detail?.item.id === item.id ? "bg-app-hover" : "hover:bg-app-hover/50"
            }`}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: TYPE_STYLES[item.type].color }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-app-text">
              {item.title}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-app border border-app-border bg-white p-5 shadow-soft">
        {!detail ? (
          <p className="text-xs text-app-muted">
            좌측에서 메모리를 선택하세요. 노드 그래프 대신, AI가 의미적으로 연결한 메모리가
            흐름 패널로 표시됩니다.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-[#e4defc] bg-gradient-to-br from-[#f5f3ff] to-white p-4">
              <TypeChip type={detail.item.type} />
              <p className="mt-1.5 text-sm font-extrabold text-app-text">{detail.item.title}</p>
              <p className="mt-1 text-[11px] text-app-muted">{detail.item.description}</p>
            </div>
            {groupsOrder.map((group) => {
              const entries = detail.related.filter((entry) => group.types.includes(entry.type));
              if (!entries.length) return null;
              return (
                <div key={group.label} className="relative pl-5">
                  <span className="absolute left-1.5 top-0 h-full w-px bg-app-border" />
                  <span className="absolute left-0 top-4 h-3 w-3 rounded-full border-2 border-white bg-app-primary" />
                  <div className="rounded-2xl border border-app-border bg-white p-3.5">
                    <p className="text-[10px] font-extrabold text-app-muted">{group.label}</p>
                    <div className="mt-1.5 space-y-1.5">
                      {entries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => onOpen(entry.id)}
                          className="flex w-full items-center gap-2 rounded-xl p-1.5 text-left transition hover:bg-app-hover/60"
                        >
                          <TypeChip type={entry.type} />
                          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-app-text">
                            {entry.title}
                          </span>
                          <span className="text-[10px] font-bold text-app-primary">
                            연결 {entry.score}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {!detail.related.length ? (
              <p className="text-[11px] text-app-muted">
                아직 연결이 없습니다. 태그·프로젝트·결정이 겹치는 메모리가 생기면 자동으로
                이어집니다.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
  onSample
}: {
  onCreate: () => void;
  onSample: () => Promise<void>;
}) {
  return (
    <div className="rounded-app border border-app-border bg-white p-10 text-center shadow-soft">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
        <Sparkles size={20} />
      </span>
      <p className="mt-3 text-sm font-extrabold text-app-text">
        AI의 장기 기억이 여기서 시작됩니다
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-app-muted">
        AI Chat에서 결정을 완료하면 의사결정·리서치·시뮬레이션·교훈이 자동으로 메모리가
        됩니다. 지금 바로 예시를 만들어 구조를 살펴보거나, 직접 첫 메모리를 남겨보세요.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => navigateWorkspace("chat")}
          className="h-10 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white shadow-soft transition hover:opacity-90"
        >
          AI Chat에서 첫 결정 시작
        </button>
        <button
          type="button"
          onClick={() => void onSample()}
          className="h-10 rounded-2xl border border-app-border bg-white px-4 text-xs font-bold text-app-primary transition hover:bg-app-hover"
        >
          예시 메모리 만들기
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="h-10 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
        >
          새 메모리 작성
        </button>
      </div>
    </div>
  );
}

function NewMemoryModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MemoryOsType>("knowledge");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/memory-os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          type,
          project,
          tags: tags.split(/[,\s]+/u).filter(Boolean)
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "메모리를 만들지 못했습니다.");
      await onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "메모리를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4">
      <div className="w-full max-w-lg rounded-app border border-app-border bg-white p-5 shadow-app">
        <p className="text-sm font-extrabold text-app-text">새 메모리</p>
        <div className="mt-3 space-y-2.5">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="제목"
            className="h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
          />
          <div className="flex gap-2">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as MemoryOsType)}
              className="h-10 flex-1 rounded-2xl border border-app-border bg-white px-2 text-xs font-semibold text-app-text"
            >
              {MEMORY_OS_TYPES.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {MEMORY_OS_TYPE_LABELS[candidate]}
                </option>
              ))}
            </select>
            <input
              value={project}
              onChange={(event) => setProject(event.target.value)}
              placeholder="프로젝트"
              className="h-10 flex-1 rounded-2xl border border-app-border bg-white px-3 text-xs text-app-text outline-none transition focus:border-app-primary"
            />
          </div>
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="태그 (쉼표 구분)"
            className="h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-xs text-app-text outline-none transition focus:border-app-primary"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={5}
            placeholder="내용 — 다음 의사결정에 도움이 될 사실, 교훈, 결과를 기록하세요."
            className="w-full rounded-2xl border border-app-border bg-white p-3 text-xs leading-5 text-app-text outline-none transition focus:border-app-primary"
          />
        </div>
        {error ? <p className="mt-2 text-xs font-semibold text-red-500">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-2xl border border-app-border px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !title.trim() || !content.trim()}
            onClick={() => void submit()}
            className="h-10 rounded-2xl bg-app-primary px-5 text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
}
