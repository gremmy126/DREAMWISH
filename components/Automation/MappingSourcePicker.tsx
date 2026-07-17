"use client";

import { Braces } from "lucide-react";
import type { MappingSource } from "@/src/lib/automation/registry/action-guide";

export function MappingSourcePicker({ sources, onSelect }: { sources: MappingSource[]; onSelect: (template: string) => void }) {
  if (sources.length === 0) return <p className="mt-1 text-[10px] leading-4 text-slate-400">연결된 이전 노드의 출력이 아직 없습니다. 노드를 연결한 뒤 선택하세요.</p>;
  return (
    <label className="mt-1.5 flex min-w-0 items-center gap-1.5">
      <Braces size={12} className="shrink-0 text-violet-500" />
      <span className="sr-only">이전 단계 출력 매핑</span>
      <select
        aria-label="이전 단계 출력 매핑"
        defaultValue=""
        onChange={(event) => {
          if (!event.target.value) return;
          onSelect(event.target.value);
          event.target.value = "";
        }}
        className="h-9 min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50 px-2 text-[10px] font-semibold text-violet-700 outline-none focus:border-violet-500"
      >
        <option value="">이전 출력에서 값 선택</option>
        {sources.map((source) => <option key={source.template} value={source.template}>{source.label} · {source.type}</option>)}
      </select>
    </label>
  );
}
