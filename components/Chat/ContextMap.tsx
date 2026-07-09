"use client";

import { FileText, Link2 } from "lucide-react";
import type { SourceDocument } from "@/src/lib/chat/chat.types";

type ContextMapProps = {
  sources: SourceDocument[];
};

const positions = [
  { x: 50, y: 14 },
  { x: 18, y: 34 },
  { x: 78, y: 38 },
  { x: 34, y: 66 },
  { x: 66, y: 72 },
  { x: 12, y: 76 },
  { x: 86, y: 18 },
  { x: 50, y: 88 }
];

export function ContextMap({ sources }: ContextMapProps) {
  const nodes = sources.slice(0, 8).map((source, index) => ({
    ...source,
    ...positions[index % positions.length]
  }));

  if (nodes.length === 0) {
    return (
      <div className="relative h-[250px] overflow-hidden rounded-app border border-dashed border-app-border bg-app-bg">
        <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[24px] border border-app-border bg-white text-slate-300 shadow-soft">
          <Link2 size={22} />
        </div>
        <p className="absolute inset-x-6 bottom-8 text-center text-xs leading-5 text-app-muted">
          답변에 사용된 문서가 생기면 연결된 맥락이 여기에 나타납니다.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[250px] overflow-hidden rounded-app border border-app-border bg-[radial-gradient(circle_at_center,#ffffff_0%,#f8fafc_70%)]">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <linearGradient id="context-line" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#6D5DF6" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        {nodes.map((node, index) => (
          <line
            key={`hub-${node.path}`}
            x1="50%"
            y1="50%"
            x2={`${node.x}%`}
            y2={`${node.y}%`}
            stroke="url(#context-line)"
            strokeWidth={index % 2 === 0 ? 1.4 : 0.9}
          />
        ))}
        {nodes.slice(1).map((node, index) => {
          const previous = nodes[index];
          return (
            <line
              key={`cross-${node.path}`}
              x1={`${previous.x}%`}
              y1={`${previous.y}%`}
              x2={`${node.x}%`}
              y2={`${node.y}%`}
              stroke="#CBD5E1"
              strokeOpacity="0.36"
              strokeWidth="0.8"
            />
          );
        })}
      </svg>

      <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[24px] bg-app-primary text-white shadow-app">
        <Link2 size={21} />
      </div>

      {nodes.map((node, index) => (
        <div
          key={node.path}
          className="absolute flex max-w-[118px] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl border border-app-border bg-white/92 px-3 py-2 shadow-soft backdrop-blur"
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
          title={node.title}
        >
          <FileText size={13} className="shrink-0 text-app-primary" />
          <span className="truncate text-[11px] font-semibold text-app-text">
            {index + 1}. {node.title}
          </span>
        </div>
      ))}
    </div>
  );
}
