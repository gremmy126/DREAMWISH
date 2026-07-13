export type AutomationTab = "scenario" | "templates" | "runs" | "connections" | "guide";
const tabs: Array<{ id: AutomationTab; label: string }> = [
  { id: "scenario", label: "시나리오" }, { id: "templates", label: "템플릿" },
  { id: "runs", label: "실행 내역" }, { id: "connections", label: "연결 관리" },
  { id: "guide", label: "사용 가이드" }
];
export function AutomationTabs({ value, onChange }: { value: AutomationTab; onChange: (value: AutomationTab) => void }) {
  return <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-slate-200 text-xs font-semibold text-slate-500">{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={`shrink-0 border-b-2 px-4 py-3 ${value === tab.id ? "border-violet-600 text-violet-600" : "border-transparent hover:text-slate-900"}`}>{tab.label}</button>)}</div>;
}
