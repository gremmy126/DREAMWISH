import type { ActionDefinition, ActionFieldDefinition, ActionValue } from "@/src/lib/automation/registry/action.types";
import type { AutomationScenario } from "@/src/lib/automation/scenario-designer";
import { listMappingSources } from "@/src/lib/automation/registry/action-guide";
import { MappingSourcePicker } from "@/components/Automation/MappingSourcePicker";

type ActionInput = Record<string, ActionValue>;

export function ActionInputForm({
  definition,
  value,
  scenario,
  nodeId,
  onChange
}: {
  definition: ActionDefinition;
  value: ActionInput;
  scenario?: AutomationScenario | null;
  nodeId?: string;
  onChange: (value: ActionInput) => void;
}) {
  const patch = (fieldId: string, next: ActionValue) => onChange({ ...value, [fieldId]: next });
  const mappingSources = scenario && nodeId ? listMappingSources(scenario, nodeId) : [];
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-3">
      <div>
        <p className="text-[11px] font-bold text-slate-700">입력값</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-400">Action v{definition.version} · Adapter v{definition.adapterVersion}</p>
      </div>
      {definition.inputSchema.fields.filter((field) => isVisible(field, value)).map((field) => (
        <ActionField key={field.id} field={field} value={value[field.id]} mappingSources={mappingSources} onChange={(next) => patch(field.id, next)} />
      ))}
      {definition.inputSchema.fields.length === 0 ? (
        <p className="text-[10px] text-slate-400">이 Action은 별도 입력값이 없습니다.</p>
      ) : null}
    </div>
  );
}

function ActionField({
  field,
  value,
  mappingSources,
  onChange
}: {
  field: ActionFieldDefinition;
  value: ActionValue | undefined;
  mappingSources: ReturnType<typeof listMappingSources>;
  onChange: (value: ActionValue) => void;
}) {
  const base = "mt-1.5 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-violet-400";
  const label = <span className="text-[10px] font-bold text-slate-500">{field.label}{field.required ? " *" : ""}</span>;
  if (field.type === "boolean") {
    return <div><label className="flex items-center gap-2">{label}<input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="accent-violet-600" /></label>{mapping(field, mappingSources, onChange)}</div>;
  }
  if (field.type === "select") {
    return <label className="block">{label}<select className={base} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">선택</option>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{mapping(field, mappingSources, onChange)}{help(field)}</label>;
  }
  if (field.type === "multiselect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return <label className="block">{label}<select multiple className={`${base} min-h-24 py-2`} value={selected} onChange={(event) => onChange(Array.from(event.target.selectedOptions, (option) => option.value))}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{mapping(field, mappingSources, onChange)}{help(field)}</label>;
  }
  if (["json", "key_value", "array", "mapping"].includes(field.type)) {
    return <label className="block">{label}<textarea className={`${base} min-h-24 py-2 font-mono`} placeholder={field.placeholder || "JSON"} value={toEditableJson(value)} onChange={(event) => onChange(parseJsonOrText(event.target.value))} />{mapping(field, mappingSources, onChange)}{help(field)}</label>;
  }
  if (field.type === "textarea") {
    return <label className="block">{label}<textarea className={`${base} min-h-24 py-2`} placeholder={field.placeholder} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />{mapping(field, mappingSources, onChange)}{help(field)}</label>;
  }
  const inputType = field.secret ? "password" : field.type === "email" || field.type === "url" || field.type === "date" || field.type === "datetime" ? field.type === "datetime" ? "datetime-local" : field.type : field.type === "number" || field.type === "integer" ? "number" : "text";
  return <label className="block">{label}<input type={inputType} className={base} min={field.min} max={field.max} placeholder={field.placeholder} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(field.type === "number" || field.type === "integer" ? event.target.value === "" ? null : Number(event.target.value) : event.target.value)} />{mapping(field, mappingSources, onChange)}{help(field)}</label>;
}

function isVisible(field: ActionFieldDefinition, input: ActionInput) {
  return !field.visibleWhen || input[field.visibleWhen.field] === field.visibleWhen.equals;
}

function toEditableJson(value: ActionValue | undefined) {
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function parseJsonOrText(value: string): ActionValue {
  if (!value.trim()) return "";
  try { return JSON.parse(value) as ActionValue; } catch { return value; }
}

function help(field: ActionFieldDefinition) {
  return field.help ? <span className="mt-1 block text-[10px] leading-4 text-slate-400">{field.help}</span> : null;
}

function mapping(field: ActionFieldDefinition, sources: ReturnType<typeof listMappingSources>, onChange: (value: ActionValue) => void) {
  return field.mappable ? <MappingSourcePicker sources={sources} onSelect={onChange} /> : null;
}
