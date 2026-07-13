"use client";

import { Check, ContactRound, Loader2, Smartphone, X } from "lucide-react";
import { useState } from "react";
import type { ContactCandidate } from "@/src/lib/devices/device.types";

export function PhoneContactImport({ onImported }: { onImported: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<ContactCandidate[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true); setBusy(true); setError(null);
    try {
      const response = await fetch("/api/devices/contact-candidates");
      const data = (await response.json().catch(() => null)) as { candidates?: ContactCandidate[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "휴대폰 연락처를 불러오지 못했습니다.");
      const pending = (data?.candidates || []).filter((item) => item.status === "pending");
      setCandidates(pending); setSelectedIds(pending.map((item) => item.id));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "휴대폰 연락처를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function importSelected() {
    if (!selectedIds.length) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/devices/contact-candidates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateIds: selectedIds }) });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "연락처를 CRM에 추가하지 못했습니다.");
      setOpen(false); await onImported();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "연락처를 CRM에 추가하지 못했습니다."); }
    finally { setBusy(false); }
  }

  return <>
    <button type="button" onClick={() => void show()} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-sm font-semibold text-app-text hover:bg-app-hover hover:text-app-primary"><Smartphone size={16} />연락처 가져오기</button>
    {open ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4"><section role="dialog" aria-modal="true" aria-labelledby="phone-contact-title" className="w-full max-w-xl rounded-app border border-app-border bg-white p-5 shadow-app"><div className="flex items-start justify-between"><div><h2 id="phone-contact-title" className="text-lg font-semibold text-app-text">휴대폰 연락처 가져오기</h2><p className="mt-1 text-xs text-app-muted">선택한 연락처만 CRM 고객으로 추가합니다.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-app-border p-2"><X size={15} /></button></div>
      {error ? <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {busy && !candidates.length ? <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-app-primary" /></div> : null}
      {!busy && !candidates.length ? <div className="mt-5 rounded-2xl border border-dashed border-app-border py-10 text-center"><ContactRound size={26} className="mx-auto text-app-primary" /><p className="mt-3 text-sm font-semibold text-app-text">가져올 연락처가 없습니다.</p><p className="mt-1 text-xs text-app-muted">비즈니스에서 휴대폰을 연결한 뒤 연락처 동기화를 실행해주세요.</p></div> : null}
      <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{candidates.map((candidate) => { const checked = selectedIds.includes(candidate.id); return <button key={candidate.id} type="button" onClick={() => setSelectedIds((current) => checked ? current.filter((id) => id !== candidate.id) : [...current, candidate.id])} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left ${checked ? "border-app-primary bg-app-hover" : "border-app-border"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-app-primary bg-app-primary text-white" : "border-app-border"}`}>{checked ? <Check size={13} /> : null}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-app-text">{candidate.name || "이름 없음"}</span><span className="mt-1 block truncate text-xs text-app-muted">{candidate.phone || candidate.email || "연락처 정보 없음"}</span></span></button>; })}</div>
      <button type="button" disabled={busy || !selectedIds.length} onClick={() => void importSelected()} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <ContactRound size={16} />}선택 연락처를 CRM에 추가</button>
    </section></div> : null}
  </>;
}
