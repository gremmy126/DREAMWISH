"use client";

import { Copy, Plus, RefreshCcw, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CouponType = "access_duration" | "percentage_discount" | "fixed_discount";
type Coupon = { id: string; name: string; codeHint: string; type: CouponType; value: number | null; accessDays: number | null; redemptionCount: number; maxRedemptions: number; startsAt: string; expiresAt: string; active: boolean; polarDiscountId: string | null };

export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [type, setType] = useState<CouponType>("access_duration");
  const [name, setName] = useState("30일 이용권");
  const [code, setCode] = useState("");
  const [value, setValue] = useState(10);
  const [accessDays, setAccessDays] = useState(30);
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [plaintextCode, setPlaintextCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const response = await fetch("/api/admin/coupons", { cache: "no-store" }); const body = await response.json().catch(() => ({})) as { coupons?: Coupon[]; error?: string }; if (!response.ok) throw new Error(body.error || "쿠폰 목록을 불러오지 못했습니다."); setCoupons(body.coupons || []); }, []);
  useEffect(() => { void load().catch((caught) => setError(caught.message)); }, [load]);

  async function create() {
    setBusy(true); setError(null); setPlaintextCode(null);
    try {
      const response = await fetch("/api/admin/coupons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, code: code || undefined, type, value: type === "access_duration" ? null : value, accessDays: type === "access_duration" ? accessDays : null, currency: "KRW", duration: "once", maxRedemptions, perUserLimit: 1, startsAt: new Date().toISOString(), expiresAt: new Date(`${expiresAt}T23:59:59+09:00`).toISOString() }) });
      const body = await response.json().catch(() => ({})) as { plaintextCode?: string; error?: string };
      if (!response.ok || !body.plaintextCode) throw new Error(body.error || "쿠폰을 생성하지 못했습니다.");
      setPlaintextCode(body.plaintextCode); setCode(""); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "쿠폰을 생성하지 못했습니다."); } finally { setBusy(false); }
  }

  async function toggle(coupon: Coupon) {
    const response = await fetch(`/api/admin/coupons/${coupon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !coupon.active }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; setError(body.error || "쿠폰 상태를 변경하지 못했습니다."); return; }
    await load();
  }

  const inputClass = "min-h-11 w-full rounded-2xl border border-app-border bg-white px-3 text-xs outline-none focus:border-app-primary";
  return <div className="space-y-5"><section className="rounded-[22px] border border-app-border bg-white p-5 shadow-soft"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">쿠폰 생성</h2><p className="mt-1 text-xs text-app-muted">이용권형은 서비스 접근 기간을 지급하고, 할인형은 Polar Checkout에 연결됩니다.</p></div><TicketCheck className="text-app-primary" size={22} /></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Field label="종류"><select value={type} onChange={(event) => setType(event.target.value as CouponType)} className={inputClass}><option value="access_duration">이용권형</option><option value="percentage_discount">정률 할인형</option><option value="fixed_discount">정액 할인형</option></select></Field><Field label="이름"><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></Field><Field label="코드(비우면 자동 생성)"><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} className={inputClass} placeholder="WELCOME30" /></Field><Field label={type === "access_duration" ? "이용 기간(일)" : type === "percentage_discount" ? "할인율(%)" : "할인액(최소 통화단위)"}><input type="number" min={1} value={type === "access_duration" ? accessDays : value} onChange={(event) => type === "access_duration" ? setAccessDays(Number(event.target.value)) : setValue(Number(event.target.value))} className={inputClass} /></Field><Field label="최대 사용 횟수"><input type="number" min={1} value={maxRedemptions} onChange={(event) => setMaxRedemptions(Number(event.target.value))} className={inputClass} /></Field><Field label="만료일"><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={inputClass} /></Field></div><button type="button" disabled={busy} onClick={() => void create()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-app-primary px-5 text-xs font-bold text-white disabled:opacity-50"><Plus size={15} />쿠폰 생성</button>{plaintextCode ? <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">이 코드는 지금 한 번만 표시됩니다. 안전한 곳에 복사하세요.</p><div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-xl bg-white px-3 py-2 text-sm font-black">{plaintextCode}</code><button type="button" aria-label="쿠폰 복사" onClick={() => void navigator.clipboard.writeText(plaintextCode)} className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><Copy size={16} /></button></div></div> : null}{error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}</section><section className="rounded-[22px] border border-app-border bg-white p-5 shadow-soft"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">발급 쿠폰</h2><button type="button" onClick={() => void load()} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border" aria-label="새로고침"><RefreshCcw size={16} /></button></div><div className="app-scrollbar mt-4 overflow-x-auto"><table className="min-w-[760px] w-full text-left text-xs"><thead className="bg-slate-50 text-app-muted"><tr>{["이름", "코드", "종류", "값", "사용량", "만료", "상태"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{coupons.map((coupon) => <tr key={coupon.id} className="border-t border-app-border"><td className="px-3 py-4 font-bold">{coupon.name}</td><td className="px-3 py-4 font-mono">{coupon.codeHint}</td><td className="px-3 py-4">{coupon.type}</td><td className="px-3 py-4">{coupon.accessDays ? `${coupon.accessDays}일` : coupon.value}</td><td className="px-3 py-4">{coupon.redemptionCount}/{coupon.maxRedemptions}</td><td className="px-3 py-4">{new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}</td><td className="px-3 py-4"><button type="button" onClick={() => void toggle(coupon)} className={`min-h-9 rounded-xl px-3 text-[10px] font-bold ${coupon.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{coupon.active ? "활성" : "중지"}</button></td></tr>)}</tbody></table></div></section></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-app-muted">{label}</span>{children}</label>; }
