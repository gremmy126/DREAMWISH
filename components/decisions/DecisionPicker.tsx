"use client";

import type { Decision } from "@/src/lib/decisions/decision.types";

type DecisionPickerProps = {
  decisions: Decision[];
  value: string | null;
  onChange: (decisionId: string) => void;
  label?: string;
};

export function DecisionPicker({
  decisions,
  value,
  onChange,
  label = "결정 프로젝트"
}: DecisionPickerProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-app-muted">
      {label}
      <select
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-2xl border border-app-border bg-white px-3 text-sm font-medium text-app-text outline-none transition focus:border-app-primary"
      >
        <option value="">결정을 선택하세요</option>
        {decisions.map((decision) => (
          <option key={decision.id} value={decision.id}>
            {decision.title}
          </option>
        ))}
      </select>
    </label>
  );
}
