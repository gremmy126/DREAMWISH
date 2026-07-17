"use client";

import { BookOpen, ChevronDown, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { AppLogo } from "@/components/shared/AppLogo";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import { getAutomationTool } from "@/src/lib/automation/tool-registry";
import { ACTION_DEFINITIONS, isActionExecutable } from "@/src/lib/automation/registry/action-registry";
import type { ActionDefinition, ActionRiskLevel } from "@/src/lib/automation/registry/action.types";

type Category = "all" | "app" | "ai" | "tool";

export function AutomationActionGuide() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [risk, setRisk] = useState<"all" | ActionRiskLevel>("all");
  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = ACTION_DEFINITIONS.filter((definition) => {
      const app = definitionLabel(definition.appId);
      return (category === "all" || definitionCategory(definition.appId) === category)
        && (risk === "all" || definition.riskLevel === risk)
        && (!query || `${app} ${definition.name} ${definition.description} ${definition.guide.useWhen}`.toLowerCase().includes(query));
    });
    return Array.from(new Set(filtered.map((item) => item.appId))).map((appId) => ({
      appId,
      definitions: filtered.filter((item) => item.appId === appId)
    }));
  }, [category, risk, search]);

  return (
    <div className="space-y-4">
      <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3"><BookOpen size={22} className="mt-0.5 text-violet-600" /><div><h2 className="text-lg font-bold text-slate-950">자동화 사용 가이드</h2><p className="mt-1 text-xs leading-5 text-slate-500">모든 앱과 도구의 실행 작업별 사용 시점, 설정값, 값의 위치와 출력 매핑을 Registry 기준으로 안내합니다.</p></div></div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={15} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="앱, 작업, 사용 목적 검색" className="min-w-0 flex-1 text-xs outline-none" /></label>
          <select aria-label="가이드 분류" value={category} onChange={(event) => setCategory(event.target.value as Category)} className="h-11 rounded-xl border border-slate-200 px-3 text-xs font-semibold"><option value="all">전체 분류</option><option value="app">외부 앱</option><option value="ai">AI</option><option value="tool">내부 도구</option></select>
          <select aria-label="위험 등급" value={risk} onChange={(event) => setRisk(event.target.value as typeof risk)} className="h-11 rounded-xl border border-slate-200 px-3 text-xs font-semibold"><option value="all">전체 위험 등급</option>{["read", "low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
        </div>
        <div className="mt-4 rounded-2xl bg-violet-50 px-4 py-3 text-xs leading-6 text-violet-800"><strong>매핑 방법:</strong> 캔버스에서 노드를 연결한 뒤 설정 패널의 보라색 매핑 선택기를 사용하세요. 각 노드의 ID도 설정 패널에서 복사할 수 있어 <code>{"{{steps.<노드ID>.text}}"}</code> 같은 값을 직접 작성할 수 있습니다.</div>
      </section>

      {groups.map(({ appId, definitions }) => <GuideGroup key={appId} appId={appId} definitions={definitions} />)}
      {groups.length === 0 ? <p className="rounded-[22px] border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-500">검색 조건에 맞는 실행 작업이 없습니다.</p> : null}
    </div>
  );
}

function GuideGroup({ appId, definitions }: { appId: string; definitions: readonly ActionDefinition[] }) {
  const app = getAutomationApp(appId);
  const tool = getAutomationTool(appId);
  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3"><AppLogo appId={appId} size={42} /><div className="min-w-0"><h3 className="truncate text-base font-bold text-slate-950">{app?.label || tool?.label || appId}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{app ? app.help : "DREAMWISH 내부 도구 · 별도 외부 계정 연결 없음"}</p></div></div>
        <span className="sm:ml-auto rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">실행 작업 {definitions.length}개</span>
      </div>
      <div className="divide-y divide-slate-100">{definitions.map((definition) => <ActionGuideCard key={`${definition.appId}:${definition.id}:${definition.version}`} definition={definition} />)}</div>
    </section>
  );
}

function ActionGuideCard({ definition }: { definition: ActionDefinition }) {
  const executable = isActionExecutable(definition.appId, definition.id, definition.version);
  return (
    <details className="group p-4 sm:p-5">
      <summary className="flex cursor-pointer list-none items-start gap-3">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-bold text-slate-900">{definition.name}</h4><RiskBadge risk={definition.riskLevel} /><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${executable ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{executable ? "사용 가능" : "준비 중"}</span></div><p className="mt-2 text-xs leading-5 text-slate-500">{definition.guide.summary}</p></div>
        <ChevronDown size={16} className="mt-1 shrink-0 text-slate-400 transition group-open:rotate-180" />
      </summary>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <GuideBox title="언제 사용" body={definition.guide.useWhen} />
        <GuideBox title="연결과 준비" body={definition.guide.setupSteps.map((step, index) => `${index + 1}. ${step}`).join("\n")} />
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-[760px] w-full text-left text-[11px]"><thead className="bg-slate-50 text-slate-500"><tr>{["설정값", "필수", "값을 어디서 구하나요?", "예시", "매핑 예시"].map((label) => <th key={label} className="px-3 py-2.5 font-bold">{label}</th>)}</tr></thead><tbody>{definition.inputSchema.fields.map((field) => <tr key={field.id} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><p className="font-bold text-slate-800">{field.label}</p><p className="mt-1 font-mono text-[9px] text-slate-400">{field.id} · {field.type}</p></td><td className="px-3 py-3 text-slate-600">{field.required ? "필수" : "선택"}</td><td className="max-w-sm px-3 py-3 leading-5 text-slate-600">{field.valueSource}</td><td className="max-w-xs px-3 py-3 font-mono text-[10px] text-slate-600">{field.secret ? "표시하지 않음" : formatExample(field.example)}</td><td className="px-3 py-3 font-mono text-[10px] text-violet-600">{field.mappingExample || "—"}</td></tr>)}</tbody></table>{definition.inputSchema.fields.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">별도 설정값이 없습니다.</p> : null}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2"><GuideBox title="권한·승인" body={`${definition.requiredScopes.length ? `필요 Scope: ${definition.requiredScopes.join(", ")}` : "추가 Scope 없음"}\n위험 등급: ${definition.riskLevel}\n${approvalText(definition)}`} icon /><GuideBox title="출력 매핑" body={definition.guide.outputMappings.length ? definition.guide.outputMappings.map((item) => `${item.label}: ${item.template}`).join("\n") : "다음 노드로 전달할 출력값이 없습니다."} /></div>
      {definition.guide.inputNotes.length ? <ul className="mt-4 list-disc space-y-1 pl-5 text-[11px] leading-5 text-slate-500">{definition.guide.inputNotes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
    </details>
  );
}

function GuideBox({ title, body, icon = false }: { title: string; body: string; icon?: boolean }) { return <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2">{icon ? <ShieldCheck size={14} className="text-violet-600" /> : null}<h5 className="text-xs font-bold text-slate-800">{title}</h5></div><p className="mt-2 whitespace-pre-line text-[11px] leading-6 text-slate-600">{body}</p></div>; }
function RiskBadge({ risk }: { risk: ActionRiskLevel }) { const color = risk === "critical" ? "bg-red-100 text-red-700" : risk === "high" ? "bg-orange-100 text-orange-700" : risk === "medium" ? "bg-amber-100 text-amber-700" : risk === "low" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"; return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${color}`}>{risk}</span>; }
function definitionLabel(appId: string) { return getAutomationApp(appId)?.label || getAutomationTool(appId)?.label || appId; }
function definitionCategory(appId: string): Exclude<Category, "all"> { return appId === "ai" || appId === "openai" ? "ai" : getAutomationApp(appId) ? "app" : "tool"; }
function formatExample(value: unknown) { if (value === undefined) return "—"; if (typeof value === "string") return value; return JSON.stringify(value); }
function approvalText(definition: ActionDefinition) { if (definition.riskLevel === "critical") return `1차 경고와 최종 승인${definition.confirmationPhrase ? `, 확인 문구 ${definition.confirmationPhrase}` : ""}, 설정된 추가 인증이 필요합니다.`; if (definition.riskLevel === "high") return `1차 경고와 2차 최종 승인${definition.confirmationPhrase ? `, 확인 문구 ${definition.confirmationPhrase}` : ""}이 필요합니다.`; if (definition.riskLevel === "medium") return "워크플로 승인 정책에 따라 자동 실행 또는 1회 승인을 사용합니다."; return "활성화된 워크플로에서는 기본 정책에 따라 자동 실행됩니다."; }
