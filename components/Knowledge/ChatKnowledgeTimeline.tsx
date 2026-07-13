"use client";

import { BrainCircuit, Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PanelShell } from "@/components/context/PanelShell";
import { buildInitialKnowledgeLayout, buildKnowledgeTimeline, type KnowledgeTimelineEvent } from "@/src/lib/knowledge/knowledge-layout";
import type { KnowledgeGraph } from "@/src/lib/memory/memory.types";

type WorkspacePayload = { graph: KnowledgeGraph; timeline: KnowledgeTimelineEvent[] };

export function ChatKnowledgeTimeline({ query }: { query: string }) {
  const [payload, setPayload] = useState<WorkspacePayload | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/knowledge/workspace", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<WorkspacePayload> : null)
      .then((data) => { if (data) setPayload(data); })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const relatedGraph = useMemo(() => {
    if (!payload) return null;
    const tokens = query.toLowerCase().split(/\s+/u).filter((token) => token.length > 1);
    const ranked = [...payload.graph.nodes].sort((a, b) => scoreNode(b.label, tokens) - scoreNode(a.label, tokens));
    const chosen = new Set(ranked.slice(0, 12).map((node) => node.id));
    const edges = payload.graph.edges.filter((edge) => chosen.has(edge.from) && chosen.has(edge.to));
    return buildInitialKnowledgeLayout({ nodes: ranked.filter((node) => chosen.has(node.id)), edges }, 300, 190);
  }, [payload, query]);
  const timeline = useMemo(() => buildKnowledgeTimeline(payload?.timeline || []), [payload]);

  return <PanelShell title="AI Chat 기억 연결" icon={BrainCircuit}><div className="relative h-[190px] overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle,#e4e7ef_1px,transparent_1px)] [background-size:14px_14px]">{relatedGraph?.nodes.length ? <svg viewBox="0 0 300 190" className="h-full w-full"><g>{relatedGraph.edges.map((edge) => { const source = relatedGraph.nodes.find((node) => node.id === edge.source); const target = relatedGraph.nodes.find((node) => node.id === edge.target); return source && target ? <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke="#8b7cf6" strokeOpacity={Math.max(.18, edge.confidence * .55)} /> : null; })}{relatedGraph.nodes.map((node, index) => <g key={node.id} transform={`translate(${node.x} ${node.y})`}><circle r={Math.min(13, node.radius)} fill={index === 0 ? "#6d5df6" : "white"} stroke="#6d5df6" strokeWidth="1.5" /><title>{node.label}</title></g>)}</g></svg> : <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-[11px] leading-5 text-slate-400">승인된 기억이 쌓이면 현재 질문과 연결된 지식이 표시됩니다.</p>}</div><div className="mt-3 flex items-center gap-2"><Clock3 size={13} className="text-violet-600" /><p className="text-[11px] font-bold text-slate-700">최근 지식 타임라인</p></div><div className="mt-2 space-y-1.5">{timeline.events.slice(-3).reverse().map((event) => <div key={event.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2"><span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" /><span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-slate-600">{event.title}</span><time className="shrink-0 text-[9px] text-slate-400">{new Date(event.createdAt).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</time></div>)}{timeline.events.length === 0 ? <p className="text-[10px] leading-5 text-slate-400">아직 승인된 지식 이벤트가 없습니다.</p> : null}</div></PanelShell>;
}

function scoreNode(label: string, tokens: string[]) {
  const normalized = label.toLowerCase();
  return tokens.reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0);
}
