"use client";

import { ExternalLink, Network } from "lucide-react";
import { useMemo, useState } from "react";
import { PanelShell } from "@/components/context/PanelShell";
import type { KnowledgeNetwork, KnowledgeNode } from "@/src/lib/network/network.types";
import type { SearchResult } from "@/src/lib/search/search.types";

const positions = [
  { x: 50, y: 50 },
  { x: 22, y: 24 },
  { x: 76, y: 22 },
  { x: 18, y: 62 },
  { x: 78, y: 68 },
  { x: 45, y: 18 },
  { x: 54, y: 84 },
  { x: 9, y: 42 },
  { x: 91, y: 43 },
  { x: 32, y: 82 },
  { x: 67, y: 12 },
  { x: 31, y: 11 }
];

export function KnowledgeNetworkPanel({
  network,
  onPreview
}: {
  network: KnowledgeNetwork | null;
  onPreview?: (result: SearchResult) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodes = (network?.nodes || []).slice(0, 12).map((node, index) => ({
    ...node,
    ...positions[index % positions.length]
  }));
  const edges = network?.edges || [];
  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) || nodes[0] || null,
    [nodes, selectedId]
  );
  const selectedEdges = selected
    ? edges.filter((edge) => edge.sourceId === selected.id || edge.targetId === selected.id)
    : [];

  return (
    <PanelShell title="연결 지도" icon={Network}>
      <div className="relative h-[260px] overflow-hidden rounded-app border border-app-border bg-[radial-gradient(circle_at_center,#fff_0%,#f8fafc_75%)]">
        <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
          {edges.map((edge) => {
            const source = nodes.find((node) => node.id === edge.sourceId);
            const target = nodes.find((node) => node.id === edge.targetId);
            if (!source || !target) return null;

            return (
              <line
                key={edge.id}
                x1={`${source.x}%`}
                y1={`${source.y}%`}
                x2={`${target.x}%`}
                y2={`${target.y}%`}
                stroke={edge.relationType === "ai_suggested_relation" ? "#6D5DF6" : "#94A3B8"}
                strokeOpacity={Math.max(0.18, edge.strength)}
                strokeWidth={edge.strength > 0.65 ? 1.8 : 1}
                strokeDasharray={edge.relationType === "ai_suggested_relation" ? "4 4" : undefined}
              />
            );
          })}
        </svg>

        {nodes.length === 0 ? (
          <p className="absolute inset-x-8 top-1/2 -translate-y-1/2 text-center text-xs leading-5 text-app-muted">
            질문을 입력하면 관련 문서와 연결 이유가 표시됩니다.
          </p>
        ) : (
          nodes.map((node, index) => (
            <button
              key={node.id}
              type="button"
              onClick={() => {
                setSelectedId(node.id);
                if (node.type !== "query") {
                  onPreview?.(nodeToSearchResult(node));
                }
              }}
              title={`${node.label}${node.score ? ` - ${Math.round(node.score * 100)}%` : ""}`}
              className={`absolute max-w-[118px] -translate-x-1/2 -translate-y-1/2 truncate rounded-2xl border px-3 py-2 text-[11px] font-semibold shadow-soft ${
                node.type === "query"
                  ? "border-app-primary bg-app-primary text-white"
                  : "border-app-border bg-white/95 text-app-text"
              }`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`
              }}
            >
              {index === 0 ? "질문" : node.label}
            </button>
          ))
        )}
      </div>
      {selected ? (
        <div className="mt-3 rounded-app border border-app-border bg-app-bg p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-app-text">
                {selected.type === "query" ? "검색 기준" : selected.label}
              </p>
              <p className="mt-1 text-[11px] text-app-muted">
                {nodeTypeLabel(selected.type)}
                {selected.score ? ` · ${Math.round(selected.score * 100)}% 관련` : ""}
              </p>
            </div>
            {selected.url ? (
              <a
                href={selected.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-2xl border border-app-border bg-white px-2 py-1 text-[11px] font-semibold text-app-primary"
              >
                링크
                <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
          {selected.path ? (
            <p className="mb-2 break-all text-[11px] leading-5 text-app-muted">
              {selected.path}
            </p>
          ) : null}
          <div className="space-y-1">
            {selectedEdges.slice(0, 4).map((edge) => (
              <p key={edge.id} className="text-[11px] leading-5 text-slate-600">
                {edge.reason}
              </p>
            ))}
            {selectedEdges.length === 0 ? (
              <p className="text-[11px] leading-5 text-slate-600">
                현재 질문의 중심 노드입니다.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </PanelShell>
  );
}

function nodeToSearchResult(node: KnowledgeNode): SearchResult {
  return {
    documentId: node.id,
    title: node.label,
    path: node.path || node.url || node.id,
    url: node.url,
    snippet: `${nodeTypeLabel(node.type)} 연결 노드입니다.`,
    score: node.score || 0.5,
    matchedBy: node.type === "web" ? "web" : "vector",
    sourceType: node.type === "web" ? "web" : "local",
    updatedAt: node.updatedAt || ""
  };
}

function nodeTypeLabel(type: KnowledgeNode["type"]) {
  const labels: Record<KnowledgeNode["type"], string> = {
    query: "질문",
    document: "문서",
    project: "프로젝트",
    note: "노트",
    file: "파일",
    tag: "태그",
    task: "작업",
    decision: "결정",
    web: "웹 문서"
  };

  return labels[type];
}
