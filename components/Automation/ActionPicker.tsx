import { listAutomationActions } from "@/src/lib/automation/action-registry";
export function ActionPicker({ appId, value, onChange }: { appId: string; value: string; onChange: (value: string) => void }) {
  const actions = listAutomationActions(appId);
  return <label className="block min-w-0"><span className="text-[11px] font-bold text-slate-500">실행 작업</span><select value={actions.some((action) => action.label === value) ? value : ""} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10 w-full min-w-0 truncate rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-violet-400"><option value="">실행할 작업 선택</option>{actions.map((action) => <option key={action.id} value={action.label}>{action.label}</option>)}</select><p className="mt-1.5 text-[10px] leading-4 text-slate-400">모듈이 수행할 작업을 선택해야 실행할 수 있습니다.</p></label>;
}
