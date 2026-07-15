"use client";

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from "d3-force";
import { CalendarRange, Filter, Focus, Maximize2, Minus, Network, Plus, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildInitialKnowledgeLayout,
  buildKnowledgeTimeline,
  type KnowledgeLayoutEdge,
  type KnowledgeLayoutNode,
  type KnowledgeTimelineEvent
} from "@/src/lib/knowledge/knowledge-layout";
import type { KnowledgeGraph } from "@/src/lib/memory/memory.types";

type SimulationNode = KnowledgeLayoutNode & SimulationNodeDatum;
type SimulationEdge = SimulationLinkDatum<SimulationNode> & KnowledgeLayoutEdge;

const colors: Record<string, string> = {
  project: "#6d5df6", memory: "#8b5cf6", person: "#0ea5e9", company: "#22c55e",
  document: "#f59e0b", tag: "#ec4899", event: "#14b8a6", schedule: "#06b6d4", idea: "#f97316"
};

export function KnowledgeWorkspace({
  graph,
  timeline,
  title = "지식 네트워크"
}: {
  graph: KnowledgeGraph;
  timeline: KnowledgeTimelineEvent[];
  title?: string;
}) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 920, height: 520 });
  const [layoutNodes, setLayoutNodes] = useState<SimulationNode[]>([]);
  const [layoutEdges, setLayoutEdges] = useState<SimulationEdge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [zoom, setZoom] = useState(1);
  const timelineModel = useMemo(() => buildKnowledgeTimeline(timeline), [timeline]);
  const selected = layoutNodes.find((node) => node.id === selectedId) || layoutNodes[0] || null;
  const types = useMemo(() => [...new Set(graph.nodes.map((node) => node.type))], [graph.nodes]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.max(520, Math.round(entry?.contentRect.width || 920));
      setSize({ width, height: 520 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const initial = buildInitialKnowledgeLayout(graph, size.width, size.height);
    const simulationNodes: SimulationNode[] = initial.nodes.map((node) => ({ ...node }));
    const nodeIds = new Set(simulationNodes.map((node) => node.id));
    const links: SimulationEdge[] = initial.edges
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge }));
    const simulation = forceSimulation(simulationNodes)
      .force("link", forceLink<SimulationNode, SimulationEdge>(links).id((node) => node.id).distance((edge) => 90 + (1 - edge.confidence) * 60).strength(0.55))
      .force("charge", forceManyBody().strength(-230))
      .force("center", forceCenter(size.width / 2, size.height / 2))
      .force("collide", forceCollide<SimulationNode>().radius((node) => node.radius + 18).strength(0.9))
      .force("x", forceX(size.width / 2).strength(0.035))
      .force("y", forceY(size.height / 2).strength(0.05))
      .alphaDecay(0.045)
      .on("tick", () => {
        setLayoutNodes(simulationNodes.map((node) => ({
          ...node,
          x: Math.max(34, Math.min(size.width - 34, node.x || size.width / 2)),
          y: Math.max(34, Math.min(size.height - 34, node.y || size.height / 2))
        })));
        setLayoutEdges([...links]);
      });
    setLayoutNodes(simulationNodes);
    setLayoutEdges(links);
    setSelectedId((current) => current && simulationNodes.some((node) => node.id === current) ? current : simulationNodes[0]?.id || null);
    return () => {
      simulation.stop();
    };
  }, [graph, size.height, size.width]);

  const visibleIds = useMemo(() => new Set(layoutNodes.filter((node) => {
    const matchesType = typeFilter === "all" || node.type === typeFilter;
    const matchesSearch = !search.trim() || node.label.toLowerCase().includes(search.trim().toLowerCase());
    return matchesType && matchesSearch;
  }).map((node) => node.id)), [layoutNodes, search, typeFilter]);

  const connectedEdges = selected
    ? graph.edges.filter((edge) => edge.from === selected.id || edge.to === selected.id)
    : [];

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2"><Sparkles size={18} className="text-violet-600" /><div><h2 className="text-sm font-bold text-slate-950">{title}</h2><p className="text-[11px] text-slate-400">지식과 아이디어의 실제 연결을 탐색하세요</p></div></div>
        <label className="ml-auto flex h-9 min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={14} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="노트, 태그, 링크 검색" className="min-w-0 flex-1 text-xs outline-none" /></label>
        <button type="button" onClick={() => { setSearch(""); setTypeFilter("all"); setZoom(1); }} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500" title="보기 초기화"><Focus size={15} /></button>
      </header>

      <div className="grid min-w-0 grid-cols-1 xl:grid-cols-[180px_minmax(0,1fr)_270px]">
        <aside className="min-w-0 border-b border-slate-200 p-4 xl:border-b-0 xl:border-r">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900"><Filter size={14} />필터</div>
          <div className="mt-4 space-y-1">
            <FilterButton label="모든 지식" count={graph.nodes.length} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} color="#6d5df6" />
            {types.map((type) => <FilterButton key={type} label={nodeTypeLabel(type)} count={graph.nodes.filter((node) => node.type === type).length} active={typeFilter === type} onClick={() => setTypeFilter(type)} color={nodeColor(type)} />)}
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-bold text-slate-500">연결 강도</p>
            <div className="mt-3 h-1.5 rounded-full bg-gradient-to-r from-violet-100 via-violet-400 to-violet-700" />
            <div className="mt-1 flex justify-between text-[9px] text-slate-400"><span>약함</span><span>강함</span></div>
          </div>
        </aside>

        <div ref={canvasRef} className="relative min-h-[520px] min-w-0 overflow-hidden bg-[radial-gradient(circle,#dfe2ec_1px,transparent_1px)] [background-size:20px_20px]">
          {graph.nodes.length ? (
            <svg viewBox={`0 0 ${size.width} ${size.height}`} className="absolute inset-0 h-full w-full" role="img" aria-label="옵시디언 스타일 지식 네트워크">
              <g transform={`translate(${size.width * (1 - zoom) / 2} ${size.height * (1 - zoom) / 2}) scale(${zoom})`}>
                {layoutEdges.map((edge) => {
                  try {
                    const source = linkNode(edge.source, layoutNodes);
                    const target = linkNode(edge.target, layoutNodes);
                    if (!source || !target || !visibleIds.has(source.id) || !visibleIds.has(target.id)) return null;
                    const active = selectedId === source.id || selectedId === target.id;
                    return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={active ? "#6d5df6" : "#b9bfd0"} strokeOpacity={active ? 0.85 : Math.max(0.15, edge.confidence * 0.48)} strokeWidth={active ? 2 : Math.max(0.7, edge.confidence * 1.5)} />;
                  } catch {
                    return null;
                  }
                })}
                {layoutNodes.map((node) => {
                  const visible = visibleIds.has(node.id);
                  const active = selectedId === node.id;
                  return <g key={node.id} transform={`translate(${node.x} ${node.y})`} onClick={() => setSelectedId(node.id)} className="cursor-pointer" opacity={visible ? 1 : 0.09}>
                    {active ? <circle r={node.radius + 10} fill={nodeColor(node.type)} opacity="0.12" /> : null}
                    <circle r={node.radius} fill={active ? nodeColor(node.type) : "white"} stroke={nodeColor(node.type)} strokeWidth={active ? 2.5 : 1.5} />
                    <circle r={Math.max(3, node.radius * 0.22)} fill={active ? "white" : nodeColor(node.type)} opacity="0.95" />
                    <text y={node.radius + 16} textAnchor="middle" fontSize="10" fontWeight={active ? 700 : 600} fill="#334155">{shortLabel(node.label)}</text>
                    <title>{node.label} · {nodeTypeLabel(node.type)} · 연결 {node.degree}개</title>
                  </g>;
                })}
              </g>
            </svg>
          ) : <div className="absolute inset-0 flex items-center justify-center"><div className="text-center"><Network className="mx-auto text-slate-300" size={36} /><p className="mt-3 text-sm font-semibold text-slate-500">승인된 기억과 노트가 쌓이면 연결 지도가 만들어집니다.</p></div></div>}
          <div className="absolute bottom-3 left-3 flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.65, value - 0.12))} className="flex h-9 w-9 items-center justify-center border-r border-slate-200 text-slate-600"><Minus size={14} /></button>
            <span className="flex h-9 w-12 items-center justify-center text-[10px] font-bold text-slate-500">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.45, value + 0.12))} className="flex h-9 w-9 items-center justify-center border-l border-slate-200 text-slate-600"><Plus size={14} /></button>
          </div>
          <Maximize2 className="absolute right-4 top-4 text-slate-400" size={15} />
        </div>

        <aside className="min-w-0 border-t border-slate-200 p-4 xl:border-l xl:border-t-0">
          <h3 className="text-xs font-bold text-slate-900">선택한 지식</h3>
          {selected ? <div className="mt-4 min-w-0"><div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: nodeColor(selected.type) }} /><div className="min-w-0"><p className="break-words text-sm font-bold leading-5 text-slate-950">{selected.label}</p><p className="mt-1 text-[10px] font-semibold text-violet-600">{nodeTypeLabel(selected.type)}</p></div></div><dl className="mt-5 space-y-3 text-xs"><Detail label="연결된 노드" value={`${selected.degree}개`} /><Detail label="근거 자료" value={`${selected.sourceIds.length}개`} /><Detail label="신뢰도" value={`${Math.round(selected.confidence * 100)}%`} /></dl><div className="mt-5 border-t border-slate-100 pt-4"><p className="text-[11px] font-bold text-slate-500">직접 연결</p><div className="mt-2 space-y-2">{connectedEdges.slice(0, 7).map((edge) => { const otherId = edge.from === selected.id ? edge.to : edge.from; const other = graph.nodes.find((node) => node.id === otherId); return <button type="button" key={edge.id} onClick={() => setSelectedId(otherId)} className="flex w-full min-w-0 items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-left"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: nodeColor(other?.type || "document") }} /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{other?.label || otherId}</span></button>; })}{connectedEdges.length === 0 ? <p className="text-[11px] leading-5 text-slate-400">아직 직접 연결된 지식이 없습니다.</p> : null}</div></div></div> : <p className="mt-4 text-xs leading-5 text-slate-400">노드를 선택하면 출처와 관계가 표시됩니다.</p>}
        </aside>
      </div>

      <KnowledgeTimeline timeline={timelineModel} />
    </section>
  );
}

function KnowledgeTimeline({ timeline }: { timeline: ReturnType<typeof buildKnowledgeTimeline> }) {
  return <div className="border-t border-slate-200 p-4"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarRange size={16} className="text-violet-600" /><div><h3 className="text-sm font-bold text-slate-950">지식 타임라인</h3><p className="text-[10px] text-slate-400">시간의 흐름에 따라 기억이 연결되고 성장합니다</p></div></div><span className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-600">{timeline.events.length}개 이벤트</span></div>{timeline.groups.length ? <div className="relative overflow-x-auto pb-2 app-scrollbar"><div className="absolute left-5 right-5 top-3 h-px bg-gradient-to-r from-violet-200 via-violet-500 to-violet-200" /><div className="relative flex min-w-max gap-5">{timeline.groups.map((group) => <div key={group.key} className="w-[190px] shrink-0"><div className="flex items-center gap-2"><span className="h-6 w-6 rounded-full border-4 border-white bg-violet-500 shadow ring-1 ring-violet-200" /><p className="text-[11px] font-bold text-slate-700">{formatMonth(group.key)}</p></div><div className="mt-3 space-y-2">{group.items.slice(0, 3).map((event) => <article key={event.id} className="min-w-0 rounded-xl border border-slate-200 bg-white p-2.5"><p className="truncate text-[11px] font-bold text-slate-800" title={event.title}>{event.title}</p><p className="mt-1 text-[9px] text-slate-400">{new Date(event.createdAt).toLocaleDateString("ko-KR")}</p></article>)}{group.items.length > 3 ? <p className="text-center text-[9px] font-bold text-violet-500">+ {group.items.length - 3}개 더 보기</p> : null}</div></div>)}</div></div> : <p className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">새 지식이 승인되면 이 시간축에 영구적으로 쌓입니다.</p>}</div>;
}

function FilterButton({ label, count, active, onClick, color }: { label: string; count: number; active: boolean; onClick: () => void; color: string }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] font-semibold ${active ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} /><span className="min-w-0 flex-1 truncate">{label}</span><span className="shrink-0 text-[9px] text-slate-400">{count}</span></button>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex min-w-0 items-center justify-between gap-3"><dt className="shrink-0 text-slate-400">{label}</dt><dd className="min-w-0 truncate font-bold text-slate-700">{value}</dd></div>; }
function linkNode(value: string | number | SimulationNode | null | undefined, nodes: SimulationNode[]): SimulationNode | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    return nodes.some((node) => node.id === value.id) ? value : null;
  }
  return nodes.find((node) => node.id === String(value)) || null;
}
function nodeColor(type: string) { return colors[type] || "#64748b"; }
function nodeTypeLabel(type: string) { return ({ project: "프로젝트", memory: "기억", person: "사람", company: "회사", document: "문서", tag: "태그", event: "이벤트", schedule: "일정", idea: "아이디어" } as Record<string, string>)[type] || type; }
function shortLabel(label: string) { return label.length > 16 ? `${label.slice(0, 15)}…` : label; }
function formatMonth(key: string) { const [year, month] = key.split("-"); return `${year}.${month}`; }
