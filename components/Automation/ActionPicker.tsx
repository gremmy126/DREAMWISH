import { isActionExecutable, listActionDefinitions } from "@/src/lib/automation/registry/action-registry";

export type ActionSelection = { actionId: string; actionVersion: number; operation: string };

export function ActionPicker({
  appId,
  actionId,
  actionVersion,
  onChange
}: {
  appId: string;
  actionId?: string | null;
  actionVersion?: number | null;
  onChange: (selection: ActionSelection) => void;
}) {
  const actions = listActionDefinitions(appId);
  const value = actions.some((action) => action.id === actionId && action.version === actionVersion)
    ? `${actionId}@${actionVersion}`
    : "";

  return (
    <label className="block min-w-0">
      <span className="text-[11px] font-bold text-slate-500">실행 작업</span>
      <select
        value={value}
        onChange={(event) => {
          const selected = actions.find((action) => `${action.id}@${action.version}` === event.target.value);
          if (selected) onChange({ actionId: selected.id, actionVersion: selected.version, operation: selected.name });
        }}
        className="mt-2 h-10 w-full min-w-0 truncate rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-violet-400"
      >
        <option value="">실행할 작업 선택</option>
        {actions.map((action) => (
          <option
            key={`${action.id}@${action.version}`}
            value={`${action.id}@${action.version}`}
            disabled={!isActionExecutable(action.appId, action.id, action.version)}
            aria-disabled={!isActionExecutable(action.appId, action.id, action.version)}
          >
            {action.name}{isActionExecutable(action.appId, action.id, action.version) ? "" : " (준비 중)"}
          </option>
        ))}
      </select>
      {actions.length === 0 ? (
        <p className="mt-1.5 text-[10px] leading-4 text-slate-400">이 도구는 별도 Action 선택 없이 설정만 편집합니다.</p>
      ) : null}
    </label>
  );
}
