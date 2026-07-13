"use client";

import { CheckCircle2, ContactRound, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

type Card = { id: string; imageName: string; name: string; email: string; phone: string; companyName: string; position: string; status: "uploaded" | "analyzed" | "approved" | "rejected"; createdAt: string };
const empty = { name: "", email: "", phone: "", companyName: "", position: "" };

export function BusinessCardImport() {
  const [cards, setCards] = useState<Card[]>([]);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); return () => { if (preview) URL.revokeObjectURL(preview); }; }, []);
  async function load() { const response = await fetch("/api/business/cards"); const data = (await response.json().catch(() => null)) as { cards?: Card[] } | null; if (response.ok) setCards(data?.cards || []); }
  function choose(next: File | null) { if (preview) URL.revokeObjectURL(preview); setFile(next); setPreview(next ? URL.createObjectURL(next) : null); }
  async function upload() {
    if (!file || !fields.name.trim()) return; setBusy(true); setError(null);
    try { const form = new FormData(); form.set("image", file); for (const [key, value] of Object.entries(fields)) form.set(key, value); const response = await fetch("/api/business/cards", { method: "POST", body: form }); const data = (await response.json().catch(() => null)) as { card?: Card; error?: string } | null; if (!response.ok || !data?.card) throw new Error(data?.error || "명함을 등록하지 못했습니다."); setCards((current) => [data.card!, ...current]); setOpen(false); setFile(null); setFields(empty); if (preview) URL.revokeObjectURL(preview); setPreview(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "명함을 등록하지 못했습니다."); } finally { setBusy(false); }
  }
  async function approve(card: Card) { setBusy(true); setError(null); try { const response = await fetch(`/api/business/cards/${encodeURIComponent(card.id)}/approve`, { method: "POST" }); const data = (await response.json().catch(() => null)) as { error?: string } | null; if (!response.ok) throw new Error(data?.error || "CRM 등록에 실패했습니다."); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : "CRM 등록에 실패했습니다."); } finally { setBusy(false); } }

  return <section className="rounded-app border border-app-border bg-white p-5 shadow-soft"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-sm font-semibold text-app-text"><ContactRound size={17} className="text-app-primary" />명함 관리</h2><p className="mt-2 text-xs text-app-muted">명함 이미지를 보관하고 내용을 직접 검토한 뒤 CRM 고객으로 등록합니다.</p></div><button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-app-primary px-4 text-xs font-semibold text-white"><ImagePlus size={15} />명함 추가</button></div>
    {error ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <article key={card.id} className="rounded-2xl border border-app-border bg-app-bg p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-app-text">{card.name}</p><p className="mt-1 truncate text-xs text-app-muted">{card.companyName || card.email || card.imageName}</p></div>{card.status === "approved" ? <CheckCircle2 size={17} className="text-emerald-600" /> : null}</div><p className="mt-3 text-xs text-app-muted">{card.phone || "전화번호 없음"}</p>{card.status !== "approved" ? <button type="button" disabled={busy} onClick={() => void approve(card)} className="mt-3 w-full rounded-xl border border-app-primary bg-white px-3 py-2 text-xs font-semibold text-app-primary disabled:opacity-50">고객으로 승인 등록</button> : <p className="mt-3 text-xs font-semibold text-emerald-700">CRM 등록 완료</p>}</article>)}</div>
    {!cards.length ? <p className="mt-4 rounded-2xl border border-dashed border-app-border py-8 text-center text-xs text-app-muted">등록된 명함이 없습니다.</p> : null}
    {open ? <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4"><section role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-app border border-app-border bg-white p-6 shadow-app"><div className="flex justify-between"><div><h3 className="text-lg font-semibold text-app-text">명함 추가</h3><p className="mt-1 text-xs text-app-muted">이미지와 추출 내용을 확인해주세요. 자동으로 CRM에 등록하지 않습니다.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-app-border p-2"><X size={15} /></button></div><div className="mt-5 grid gap-5 md:grid-cols-2"><label className="flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-app-border bg-app-bg">{preview ? <img src={preview} alt="명함 미리보기" className="h-full max-h-72 w-full object-contain" /> : <><Upload size={24} className="text-app-primary" /><span className="mt-3 text-xs font-semibold text-app-text">명함 이미지 선택</span></>}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event.target.files?.[0] || null)} /></label><div className="space-y-3">{Object.entries({ name: "이름", companyName: "회사", position: "직책", email: "이메일", phone: "전화번호" }).map(([key, label]) => <label key={key} className="block text-xs font-semibold text-app-muted">{label}<input value={fields[key as keyof typeof fields]} onChange={(event) => setFields((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 h-10 w-full rounded-xl border border-app-border bg-app-bg px-3 text-sm outline-none focus:border-app-primary" /></label>)}</div></div>{error ? <p className="mt-4 text-xs text-red-600">{error}</p> : null}<button type="button" disabled={busy || !file || !fields.name.trim()} onClick={() => void upload()} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-app bg-app-primary text-sm font-semibold text-white disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}명함 검토본 저장</button></section></div> : null}
  </section>;
}
