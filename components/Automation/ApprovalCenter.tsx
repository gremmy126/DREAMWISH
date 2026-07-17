"use client";

import { AlertTriangle, CheckCircle2, Clock3, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalSnapshot, ApprovalState } from "@/src/lib/automation/approval/approval.types";
import type { ActionDefinition } from "@/src/lib/automation/registry/action.types";
import { reauthenticateFirebasePassword } from "@/src/lib/firebase/firebase-client";
import { AppLogo } from "@/components/shared/AppLogo";

type ApprovalItem = {
  id: string;
  state: ApprovalState;
  snapshot: ApprovalSnapshot;
  approvalExpiresAt: string;
  criticalAuthMethod: string | null;
  definition: ActionDefinition | null;
  workflowName: string;
  connection: { accountLabel: string | null; accountEmail: string | null; status: string; credentialStatus: string; grantedScopes: string[] } | null;
  rateLimitRemaining: number | null;
  preview: { beforeValues?: Record<string, unknown>; afterValues?: Record<string, unknown> } | null;
};

export function ApprovalCenter() {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [criticalPassword, setCriticalPassword] = useState("");
  const [criticalOtp, setCriticalOtp] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/automation/approvals", { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { approvals?: ApprovalItem[]; error?: string };
    if (!response.ok) throw new Error(data.error || "승인 요청을 불러오지 못했습니다.");
    setItems(data.approvals || []);
  }, []);
  useEffect(() => { void load().catch((error) => setNotice(error.message)); }, [load]);

  const selected = items.find((item) => item.id === selectedId) || null;
  const definition = selected?.definition || null;
  const confirmationPhrase = definition?.confirmationPhrase || null;
  const pending = useMemo(() => items.filter((item) => item.state === "waiting_warning" || item.state === "waiting_final_approval"), [items]);

  async function mutate(action: "warning" | "final" | "reject" | "edit", body: Record<string, unknown> = {}) {
    if (!selected) return;
    setBusy(true); setNotice(null);
    try {
      if (action === "final" && selected.criticalAuthMethod === "password") {
        if (!criticalPassword) throw new Error("현재 비밀번호를 입력해 주세요.");
        body = { ...body, criticalAuthToken: await reauthenticateFirebasePassword(criticalPassword) };
      }
      if (action === "final" && selected.criticalAuthMethod === "otp") body = { ...body, criticalAuthCode: criticalOtp };
      const response = await fetch(`/api/automation/approvals/${selected.id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || "승인 요청을 처리하지 못했습니다.");
      setPhrase(""); setCriticalPassword(""); setCriticalOtp(""); setEditing(false); setSelectedId(null); await load();
      setNotice(action === "warning" ? "1차 경고를 확인했습니다. 아직 실행되지 않았으며 최종 승인을 기다립니다." : action === "final" ? "최종 승인되었습니다. 안전한 Queue에 실행 작업을 등록했습니다." : action === "edit" ? "기존 Snapshot을 폐기하고 새 Preview와 승인 요청을 만들었습니다." : "승인 요청을 취소했습니다.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "승인 처리에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <section className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">승인 센터</h2><p className="mt-1 text-xs leading-5 text-slate-500">일반 작업은 활성화된 워크플로에서 자동으로 실행됩니다. 삭제, 환불, 배포, 권한 변경 등 고위험 작업은 한 번 더 알림한 뒤 최종 승인을 받아야 실행됩니다.</p></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">대기 {pending.length}</span></div>
      {notice ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">{notice}</p> : null}
      <div className="mt-5 divide-y divide-slate-100">{items.length ? items.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setEditValue(JSON.stringify(item.snapshot.normalizedInput, null, 2)); }} className="flex w-full items-center gap-3 py-3 text-left"><RiskIcon risk={item.snapshot.riskLevel} /><AppLogo appId={item.snapshot.appId || "unknown"} size={24} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-900">{item.snapshot.appId || "앱"} · {item.snapshot.actionId}</span><span className="mt-1 block text-[10px] text-slate-500">Execution {item.snapshot.executionId} · 만료 {formatDate(item.approvalExpiresAt)}</span></span><StateBadge state={item.state} /></button>) : <p className="py-12 text-center text-xs text-slate-400">승인 요청이 없습니다.</p>}</div>
    </section>

    {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-label="고위험 작업 승인">
      <div className="max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl">
        {selected.state === "waiting_warning" ? <>
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 text-amber-600" /><AppLogo appId={selected.snapshot.appId || "unknown"} size={40} /><div><h3 className="text-lg font-black text-slate-950">고위험 작업 1차 경고</h3><p className="mt-1 text-xs leading-5 text-slate-600">이 작업은 외부 데이터에 중대한 변경을 발생시킬 수 있습니다. 계속 진행하면 최종 승인 단계로 이동합니다.</p></div></div>
          <DetailGrid rows={warningRows(selected, definition)} />
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setSelectedId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">나중에 승인</button><button type="button" disabled={busy} onClick={() => void mutate("reject")} className="rounded-xl border border-red-200 px-4 py-2 text-xs font-bold text-red-700">취소</button><button type="button" disabled={busy} onClick={() => void mutate("warning")} className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white">{busy ? "처리 중" : "계속 진행"}</button></div>
        </> : selected.state === "waiting_final_approval" ? <>
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 text-red-600" /><AppLogo appId={selected.snapshot.appId || "unknown"} size={40} /><div><h3 className="text-lg font-black text-slate-950">2차 최종 승인</h3><p className="mt-1 text-xs text-slate-600">Adapter는 아직 호출되지 않았습니다. 아래 승인 내용과 실제 실행 내용은 실행 직전에 해시로 다시 비교됩니다.</p></div></div>
          <DetailGrid rows={finalRows(selected, definition)} />
          {editing ? <label className="mt-4 block"><span className="text-xs font-bold text-slate-700">새 입력값 JSON</span><textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} className="mt-2 h-40 w-full rounded-xl border border-slate-200 p-3 font-mono text-xs" /><button type="button" disabled={busy} onClick={() => { try { void mutate("edit", { input: JSON.parse(editValue) as unknown }); } catch { setNotice("유효한 JSON을 입력하세요."); } }} className="mt-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white">새 Preview와 승인 요청 생성</button></label> : null}
          {confirmationPhrase ? <label className="mt-4 block rounded-2xl border border-red-200 bg-red-50 p-4"><span className="text-xs font-black text-red-800">확인 문구 <code>{confirmationPhrase}</code>를 정확히 입력하세요.</span><input value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" className="mt-2 h-11 w-full rounded-xl border border-red-300 bg-white px-3 font-mono text-sm font-bold outline-none" /></label> : null}
          {selected.criticalAuthMethod === "password" ? <label className="mt-3 block rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs font-black text-amber-900">현재 비밀번호 재확인</span><input type="password" value={criticalPassword} onChange={(event) => setCriticalPassword(event.target.value)} autoComplete="current-password" className="mt-2 h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm outline-none" /></label> : null}
          {selected.criticalAuthMethod === "otp" ? <label className="mt-3 block rounded-2xl border border-amber-200 bg-amber-50 p-4"><span className="text-xs font-black text-amber-900">OTP 코드</span><input inputMode="numeric" value={criticalOtp} onChange={(event) => setCriticalOtp(event.target.value.replace(/\D/gu, "").slice(0, 8))} autoComplete="one-time-code" className="mt-2 h-11 w-full rounded-xl border border-amber-300 bg-white px-3 font-mono text-sm outline-none" /></label> : null}
          {selected.criticalAuthMethod ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">추가 인증: {selected.criticalAuthMethod}</p> : null}
          <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setSelectedId(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">나중에 승인</button><button type="button" onClick={() => setEditing((value) => !value)} className="rounded-xl border border-violet-200 px-4 py-2 text-xs font-bold text-violet-700">입력값 수정</button><button type="button" disabled={busy} onClick={() => void mutate("reject")} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold">취소</button><button type="button" disabled={busy || Boolean(selected.criticalAuthMethod === "otp" && !/^\d{6,8}$/u.test(criticalOtp)) || Boolean(selected.criticalAuthMethod === "password" && !criticalPassword) || Boolean(confirmationPhrase && phrase !== confirmationPhrase)} onClick={() => void mutate("final", { phrase })} className="rounded-xl border border-red-800 bg-red-600 px-4 py-2 text-xs font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-35">{busy ? <Loader2 size={14} className="animate-spin" /> : "최종 승인하고 실행"}</button></div>
        </> : <div className="text-center"><CheckCircle2 className="mx-auto text-emerald-600" /><h3 className="mt-3 font-bold">이미 처리된 승인 요청입니다.</h3><button type="button" onClick={() => setSelectedId(null)} className="mt-5 rounded-xl border px-4 py-2 text-xs font-bold">닫기</button></div>}
      </div>
    </div> : null}
  </div>;
}

function warningRows(item: ApprovalItem, definition: ActionDefinition | null) { const s = item.snapshot; return [["실행하려는 작업 이름", definition?.name || s.actionId], ["대상 앱", s.appId || "-"], ["연결된 계정", item.connection?.accountLabel || item.connection?.accountEmail || s.targetAccount || "-"], ["Credential 상태", item.connection?.credentialStatus || "해당 없음"], ["OAuth Scope", item.connection?.grantedScopes.join(", ") || "해당 없음"], ["Rate Limit 잔여", item.rateLimitRemaining === null ? "확인되지 않음" : String(item.rateLimitRemaining)], ["변경 대상", s.targetResources.join(", ") || "-"], ["영향을 받는 데이터 개수", `${s.executionCount}건`], ["되돌릴 수 있는지 여부", definition?.previewDefinition.reversible === true ? "가능" : "어려움"], ["예상 결과", definition?.previewDefinition.title || s.actionId], ["실패 시 영향", definition?.previewDefinition.failureImpact || "현재 단계가 실패합니다."], ["실행 예정 시각", s.scheduledFor ? formatDate(s.scheduledFor) : "승인 직후"], ["워크플로 이름", item.workflowName], ["실행 ID", s.executionId]]; }
function finalRows(item: ApprovalItem, definition: ActionDefinition | null) { const s = item.snapshot; return [["최종 실행 명령", `${s.appId}.${s.actionId}@${s.actionVersion}`], ["대상 계정", item.connection?.accountLabel || item.connection?.accountEmail || s.targetAccount || "-"], ["대상 리소스", s.targetResources.join(", ") || "-"], ["변경 전 값", JSON.stringify(item.preview?.beforeValues || {})], ["변경 후 값", JSON.stringify(item.preview?.afterValues || s.normalizedInput)], ["실행 건수", `${s.executionCount}건`], ["예상 비용", s.amount === null ? "없음/미정" : `${s.amount.toLocaleString()} ${s.currency || ""}`], ["되돌리기 가능 여부", definition?.previewDefinition.reversible === true ? "가능" : "어려움"], ["위험 등급", s.riskLevel], ["승인 만료 시간", formatDate(s.approvalExpiresAt)]]; }
function DetailGrid({ rows }: { rows: string[][] }) { return <dl className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className="bg-white p-3"><dt className="text-[10px] font-bold text-slate-400">{label}</dt><dd className="mt-1 break-words text-xs font-semibold text-slate-800">{value}</dd></div>)}</dl>; }
function StateBadge({ state }: { state: ApprovalState }) { return <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${state.startsWith("waiting") ? "bg-amber-100 text-amber-700" : state === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{state}</span>; }
function RiskIcon({ risk }: { risk: string }) { return risk === "critical" ? <XCircle className="text-red-600" size={18} /> : risk === "high" ? <AlertTriangle className="text-amber-600" size={18} /> : <Clock3 className="text-blue-600" size={18} />; }
function formatDate(value: string) { return new Date(value).toLocaleString("ko-KR"); }
