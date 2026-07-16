"use client";

import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, KeyRound, Loader2, PlayCircle, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AutomationAppLogo } from "@/components/Automation/AutomationAppLogo";
import { AUTOMATION_APPS, getAutomationApp } from "@/src/lib/automation/app-registry";
import type { PublicAutomationCredential } from "@/src/lib/automation/credential.repository";
import type { AutomationRun } from "@/src/lib/automation/run.repository";
import type { RunApprovalPreview } from "@/src/lib/automation/run-approval";
import type { AutomationScenario } from "@/src/lib/automation/scenario-designer";

const gallery = [
  { title: "이메일을 Notion에 저장", description: "새 Gmail을 요약해 Notion 페이지로 저장", prompt: "Gmail의 중요한 이메일을 AI로 요약해 Notion에 저장해줘", apps: ["gmail", "notion"] },
  { title: "Slack 영업 알림", description: "고객 메시지를 CRM에 추가하고 담당 채널에 알림", prompt: "Slack의 새 고객 메시지를 CRM에 등록하고 Slack에 알려줘", apps: ["slack"] },
  { title: "Shopify 주문 보고", description: "신규 주문을 시트에 기록하고 메일 발송", prompt: "Shopify 새 주문을 Google Sheets에 기록하고 Gmail로 알려줘", apps: ["shopify", "google-sheets", "gmail"] },
  { title: "SNS 콘텐츠 배포", description: "승인된 이미지를 Instagram과 Facebook에 게시", prompt: "승인된 마케팅 이미지를 Instagram과 Facebook에 게시하는 자동화를 만들어줘", apps: ["instagram", "facebook"] }
];

export function TemplateGallery({ onUse }: { onUse: (prompt: string) => void }) {
  return <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-base font-bold text-slate-950">자동화 템플릿</h2><p className="mt-1 text-xs text-slate-500">필요한 계정과 작업을 확인한 뒤 편집 가능한 초안으로 사용합니다.</p><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">{gallery.map((item) => <article key={item.title} className="rounded-2xl border border-slate-200 p-4"><div className="flex -space-x-1">{item.apps.map((id) => <AutomationAppLogo key={id} appId={id} size={32} />)}</div><h3 className="mt-4 text-sm font-bold text-slate-900">{item.title}</h3><p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{item.description}</p><button type="button" onClick={() => onUse(item.prompt)} className="mt-4 h-9 w-full rounded-xl border border-violet-200 text-xs font-bold text-violet-600 hover:bg-violet-50">사용하기</button></article>)}</div></section>;
}

export function RunHistory({ scenarios, onOpen }: { scenarios: AutomationScenario[]; onOpen: (scenario: AutomationScenario) => void }) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<RunApprovalPreview | null>(null);
  const [busyRunId, setBusyRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadRuns() {
    try {
      const response = await fetch("/api/automation/runs", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as { runs?: AutomationRun[] };
      if (response.ok) setRuns(data.runs || []);
    } catch {
      setRuns([]);
    }
  }

  useEffect(() => { void loadRuns(); }, []);

  async function openApprovalPreview(runId: string) {
    setBusyRunId(runId);
    setNotice(null);
    try {
      const response = await fetch(`/api/automation/runs/${runId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({})
      });
      const data = (await response.json().catch(() => ({}))) as { preview?: RunApprovalPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "미리보기를 불러오지 못했습니다.");
      setPreview(data.preview);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "미리보기를 불러오지 못했습니다.");
    } finally {
      setBusyRunId(null);
    }
  }

  async function confirmApproval(runId: string) {
    setBusyRunId(runId);
    setNotice(null);
    try {
      const response = await fetch(`/api/automation/runs/${runId}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true })
      });
      const data = (await response.json().catch(() => ({}))) as { run?: AutomationRun; error?: string };
      if (!response.ok || !data.run) throw new Error(data.error || "승인 실행에 실패했습니다.");
      setPreview(null);
      setNotice("승인된 외부 작업을 실행했습니다. 각 단계의 결과를 확인하세요.");
      setExpandedId(runId);
      await loadRuns();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "승인 실행에 실패했습니다.");
    } finally {
      setBusyRunId(null);
    }
  }

  const scenarioRows = scenarios.filter((scenario) => scenario.runs > 0 || scenario.lastRunAt);

  return <div className="space-y-4">
    {notice ? <p className="rounded-2xl border border-app-border bg-white px-4 py-3 text-xs text-slate-700">{notice}</p> : null}

    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5"><h2 className="text-base font-bold text-slate-950">실행 로그</h2><p className="mt-1 text-xs text-slate-500">예약·수동 실행의 단계별 결과입니다. 외부 발송 대기 단계는 승인 후에만 실제로 전송됩니다.</p></div>
      {runs.length ? <div className="divide-y divide-slate-100">{runs.map((run) => {
        const pendingApproval = run.steps.some((step) => step.status === "approval_required");
        const expanded = expandedId === run.id;
        return <div key={run.id} className="px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${run.status === "success" ? "bg-emerald-100 text-emerald-700" : run.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{run.status === "success" ? "성공" : run.status === "partial" ? "부분 완료" : "실패"}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{run.trigger === "schedule" ? "예약" : "수동"}</span>
            <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">{run.scenarioName}</p>
            <span className="text-[10px] text-slate-500">{new Date(run.startedAt).toLocaleString("ko-KR")}</span>
            {pendingApproval ? <button type="button" disabled={busyRunId === run.id} onClick={() => void openApprovalPreview(run.id)} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50">{busyRunId === run.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />}승인 후 실행</button> : null}
            <button type="button" aria-label={expanded ? "접기" : "자세히"} onClick={() => setExpandedId(expanded ? null : run.id)} className="rounded-lg border border-slate-200 p-1 text-slate-500">{expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</button>
          </div>
          {expanded ? <ul className="mt-2 space-y-1">
            {run.steps.map((step) => <li key={step.nodeId} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px]">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${step.status === "success" ? "bg-emerald-100 text-emerald-700" : step.status === "approval_required" ? "bg-amber-100 text-amber-700" : step.status === "skipped" ? "bg-slate-200 text-slate-600" : "bg-red-100 text-red-700"}`}>{stepStatusLabel(step.status)}</span>
              <span className="shrink-0 font-bold text-slate-800">{step.order}. {step.label}</span>
              <span className="min-w-0 flex-1 truncate text-slate-500">{step.detail}</span>
            </li>)}
            {run.error ? <li className="rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">{run.error}</li> : null}
          </ul> : null}
        </div>;
      })}</div> : <p className="py-12 text-center text-sm text-slate-500">아직 실행된 자동화가 없습니다.</p>}
    </section>

    {preview ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4" role="dialog" aria-label="승인 미리보기">
      <div className="max-h-[80vh] w-full max-w-[520px] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-sm font-bold text-slate-950">외부 발송 승인 미리보기</h3>
        <p className="mt-1 text-xs text-slate-500">{preview.scenarioName} · 아래 내용이 승인 즉시 실제로 전송됩니다.</p>
        <ul className="mt-4 space-y-2">
          {preview.actions.map((action) => <li key={action.nodeId} className={`rounded-xl border px-3 py-2.5 text-xs ${action.missing.length > 0 ? "border-red-200 bg-red-50" : action.kind === "unsupported" ? "border-slate-200 bg-slate-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className="font-bold text-slate-800">{action.label} ({action.app})</p>
            <p className="mt-1 break-words leading-4 text-slate-600">{action.preview}</p>
            {action.missing.length > 0 ? <p className="mt-1 font-semibold text-red-600">누락: {action.missing.join(", ")}</p> : null}
          </li>)}
          {preview.actions.length === 0 ? <li className="py-4 text-center text-xs text-slate-500">승인 대기 중인 외부 작업이 없습니다.</li> : null}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => setPreview(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600">취소</button>
          <button type="button" disabled={busyRunId !== null || preview.actions.length === 0} onClick={() => void confirmApproval(preview.runId)} className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">승인하고 실행</button>
        </div>
      </div>
    </div> : null}

    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h2 className="text-base font-bold text-slate-950">시나리오 통계</h2><p className="mt-1 text-xs text-slate-500">실제로 실행된 시나리오 통계만 표시합니다.</p></div>{scenarioRows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["시나리오", "상태", "마지막 실행", "실행 횟수", "성공률", "열기"].map((label) => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody>{scenarioRows.map((scenario) => <tr key={scenario.id} className="border-t border-slate-100"><td className="max-w-xs truncate px-4 py-3 font-bold text-slate-900">{scenario.name}</td><td className="px-4 py-3 text-slate-600">{scenario.status}</td><td className="px-4 py-3 text-slate-600">{scenario.lastRunAt ? new Date(scenario.lastRunAt).toLocaleString("ko-KR") : "-"}</td><td className="px-4 py-3 text-slate-600">{scenario.runs}</td><td className="px-4 py-3 text-slate-600">{scenario.runs ? Math.round(scenario.successfulRuns / scenario.runs * 100) : 0}%</td><td className="px-4 py-3"><button type="button" onClick={() => onOpen(scenario)} className="inline-flex items-center gap-1 font-bold text-violet-600"><PlayCircle size={13} />시나리오</button></td></tr>)}</tbody></table></div> : <p className="py-16 text-center text-sm text-slate-500">아직 실행된 시나리오가 없습니다.</p>}</section>
  </div>;
}

function stepStatusLabel(status: string) {
  if (status === "success") return "성공";
  if (status === "approval_required") return "승인 대기";
  if (status === "skipped") return "건너뜀";
  return "실패";
}

export function ConnectionManager({ credentials, onSave }: { credentials: PublicAutomationCredential[]; onSave: (input: { appId: string; label: string; values: Record<string, string> }) => Promise<void> }) {
  const [search, setSearch] = useState(""); const [selectedId, setSelectedId] = useState("openai"); const [values, setValues] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const apps = useMemo(() => AUTOMATION_APPS.filter((app) => `${app.label} ${app.id}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const selected = getAutomationApp(selectedId) || AUTOMATION_APPS[0]!;
  async function save() { if (selected.authType === "oauth") { window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "integrations" } })); return; } setBusy(true); setError(null); try { await onSave({ appId: selected.id, label: `${selected.label} 연결`, values }); setValues({}); } catch (caught) { setError(caught instanceof Error ? caught.message : "연결 정보를 저장하지 못했습니다."); } finally { setBusy(false); } }
  return <section className="grid min-h-[650px] grid-cols-1 overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm xl:grid-cols-[280px_minmax(0,1fr)]"><aside className="border-b border-slate-200 p-3 xl:border-b-0 xl:border-r"><label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={14} className="text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="앱 검색" className="min-w-0 flex-1 text-xs outline-none" /></label><div className="mt-3 max-h-[570px] space-y-1 overflow-y-auto">{apps.map((app) => { const connected = credentials.some((item) => item.appId === app.id); return <button key={app.id} type="button" onClick={() => { setSelectedId(app.id); setValues({}); setError(null); }} className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left ${selected.id === app.id ? "bg-violet-50" : "hover:bg-slate-50"}`}><AutomationAppLogo appId={app.id} size={30} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-800">{app.label}</span><span className={`mt-0.5 block text-[10px] ${connected ? "text-emerald-600" : "text-slate-400"}`}>{connected ? "저장됨" : authLabel(app.authType)}</span></span></button>; })}</div></aside><div className="p-6"><div className="flex items-center gap-4"><AutomationAppLogo appId={selected.id} size={48} /><div><h2 className="text-lg font-bold text-slate-950">{selected.label} 연결</h2><p className="mt-1 text-xs text-slate-500">{selected.help}</p></div></div><div className="mt-6 max-w-xl space-y-4">{selected.authType === "oauth" ? <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-xs leading-6 text-blue-800"><ShieldCheck size={18} className="mb-2" />일반 사용자는 Client ID나 Client Secret을 입력하지 않습니다. 운영자 서버 설정이 완료된 뒤 연동 화면에서 계정 로그인과 권한 동의를 진행합니다.</div> : selected.credentialFields.map((credentialField) => <label key={credentialField.id} className="block"><span className="text-xs font-bold text-slate-600">{credentialField.label}{credentialField.required ? " *" : ""}</span><input type={credentialField.secret ? "password" : "text"} value={values[credentialField.id] || ""} onChange={(event) => setValues((current) => ({ ...current, [credentialField.id]: event.target.value }))} placeholder={credentialField.placeholder || credentialField.label} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-violet-400" /></label>)}{error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}<button type="button" disabled={busy || (selected.authType !== "oauth" && selected.credentialFields.some((field) => field.required && !values[field.id]?.trim()))} onClick={() => void save()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm font-bold text-white disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : selected.authType === "oauth" ? <CheckCircle2 size={16} /> : <KeyRound size={16} />}{selected.authType === "oauth" ? "계정 연동으로 이동" : "암호화하여 저장"}</button><div className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">저장된 키 원문은 다시 표시하지 않으며 서버에서 AES-256-GCM으로 암호화합니다.</div></div></div></section>;
}

export function AutomationGuide() {
  return <section className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><BookOpen size={22} className="text-violet-600" /><div><h2 className="text-lg font-bold text-slate-950">자동화 사용 가이드</h2><p className="mt-1 text-xs text-slate-500">모듈 연결부터 안전한 실행까지</p></div></div><ol className="mt-6 grid gap-4 md:grid-cols-2">{[ ["1. 앱 또는 도구 선택", "왼쪽 카탈로그에서 모듈을 추가합니다."], ["2. 실행 작업 선택", "모듈로 수행할 조회·생성·수정·삭제 작업을 지정합니다."], ["3. 계정 또는 키 연결", "OAuth는 연동 화면에서, API 키는 연결 관리에서 앱별 필드를 입력합니다."], ["4. 입력값 매핑", "이전 단계 출력과 현재 작업의 필수 입력을 연결합니다."], ["5. 테스트 후 저장", "개별 모듈을 확인하고 시나리오를 저장합니다."], ["6. 수동 실행 또는 활성화", "실행 전 오류를 확인하고 사용자가 직접 실행하거나 실시간 실행을 켭니다."] ].map(([title, body]) => <li key={title} className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-900">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{body}</p></li>)}</ol></section>;
}
function authLabel(value: string) { return value === "oauth" ? "OAuth 계정 연결" : value === "api_key" ? "API Key" : value === "multi_field" ? "여러 키 값 필요" : "Token 필요"; }
