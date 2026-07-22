"use client";

import { Copy, Download, Plus, RefreshCcw, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type CouponType = "access_duration" | "percentage_discount" | "fixed_discount";
type CouponDuration = "once" | "months" | "forever";
type Coupon = { id: string; name: string; codeHint: string; type: CouponType; value: number | null; accessDays: number | null; redemptionCount: number; maxRedemptions: number; startsAt: string; expiresAt: string; active: boolean; polarDiscountId: string | null };

const TYPE_LABELS: Record<CouponType, string> = {
  access_duration: "이용권형",
  percentage_discount: "정률 할인형",
  fixed_discount: "정액 할인형"
};

const DEFAULT_NAMES: Record<CouponType, string> = {
  access_duration: "30일 이용권",
  percentage_discount: "정률 할인 쿠폰",
  fixed_discount: "정액 할인 쿠폰"
};

// 쿠폰 관리 — 종류에 따라 설정 항목이 달라진다:
//  · 이용권형: 이용 기간(일)만 설정, 결제 없이 접근 기간 지급
//  · 정률 할인형: 할인율(%) + 할인 적용 방식(1회/N개월/계속), Polar 연동
//  · 정액 할인형: 할인액(원) + 할인 적용 방식, Polar 연동
// 여러 장을 한 번에 발급하면 CSV(엑셀)로 내려받아 카카오톡 쿠폰 등록 등에
// 바로 붙여넣을 수 있다.
export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [type, setType] = useState<CouponType>("access_duration");
  const [name, setName] = useState(DEFAULT_NAMES.access_duration);
  const [code, setCode] = useState("");
  const [value, setValue] = useState(10);
  const [accessDays, setAccessDays] = useState(30);
  const [duration, setDuration] = useState<CouponDuration>("once");
  const [durationMonths, setDurationMonths] = useState(3);
  const [quantity, setQuantity] = useState(1);
  const [maxRedemptions, setMaxRedemptions] = useState(100);
  const [expiresAt, setExpiresAt] = useState(() => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const [issuedCodes, setIssuedCodes] = useState<string[]>([]);
  const [issuedMeta, setIssuedMeta] = useState<{ name: string; type: CouponType; value: number; accessDays: number; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/coupons", { cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { coupons?: Coupon[]; error?: string };
    if (!response.ok) throw new Error(body.error || "쿠폰 목록을 불러오지 못했습니다.");
    setCoupons(body.coupons || []);
  }, []);
  useEffect(() => { void load().catch((caught) => setError(caught.message)); }, [load]);

  function changeType(next: CouponType) {
    setType(next);
    // 사용자가 이름을 직접 바꾸지 않았다면 종류에 맞는 기본 이름으로 교체한다.
    if (Object.values(DEFAULT_NAMES).includes(name)) setName(DEFAULT_NAMES[next]);
    if (next === "percentage_discount" && (value < 1 || value > 100)) setValue(10);
    if (next === "fixed_discount" && value < 100) setValue(5000);
    setQuantity((current) => Math.min(current, next === "access_duration" ? 500 : 100));
  }

  async function create() {
    setBusy(true); setError(null); setIssuedCodes([]); setIssuedMeta(null);
    try {
      const response = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          code: quantity === 1 && code ? code : undefined,
          type,
          value: type === "access_duration" ? null : value,
          accessDays: type === "access_duration" ? accessDays : null,
          currency: "KRW",
          duration: type === "access_duration" ? "once" : duration,
          durationMonths: type !== "access_duration" && duration === "months" ? durationMonths : null,
          maxRedemptions,
          perUserLimit: 1,
          quantity,
          startsAt: new Date().toISOString(),
          expiresAt: new Date(`${expiresAt}T23:59:59+09:00`).toISOString()
        })
      });
      const body = await response.json().catch(() => ({})) as { plaintextCodes?: string[]; plaintextCode?: string; error?: string };
      const codes = body.plaintextCodes || (body.plaintextCode ? [body.plaintextCode] : []);
      if (!codes.length) throw new Error(body.error || "쿠폰을 생성하지 못했습니다.");
      if (body.error) setError(body.error);
      setIssuedCodes(codes);
      setIssuedMeta({ name, type, value, accessDays, expiresAt });
      setCode("");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "쿠폰을 생성하지 못했습니다."); } finally { setBusy(false); }
  }

  // 카카오 쿠폰 대량 등록 등에 붙여넣을 수 있는 엑셀(CSV, UTF-8 BOM) 다운로드.
  function downloadCsv() {
    if (!issuedCodes.length || !issuedMeta) return;
    const valueLabel = issuedMeta.type === "access_duration"
      ? `${issuedMeta.accessDays}일`
      : issuedMeta.type === "percentage_discount"
        ? `${issuedMeta.value}%`
        : `${issuedMeta.value}원`;
    const rows = [
      ["쿠폰코드", "이름", "종류", "값", "만료일"],
      ...issuedCodes.map((couponCode) => [
        couponCode,
        issuedMeta.name,
        TYPE_LABELS[issuedMeta.type],
        valueLabel,
        issuedMeta.expiresAt
      ])
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/gu, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dreamwish-coupons-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function toggle(coupon: Coupon) {
    const response = await fetch(`/api/admin/coupons/${coupon.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !coupon.active }) });
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; setError(body.error || "쿠폰 상태를 변경하지 못했습니다."); return; }
    await load();
  }

  const inputClass = "min-h-11 w-full rounded-2xl border border-app-border bg-app-card px-3 text-xs outline-none focus:border-app-primary";
  const maxQuantity = type === "access_duration" ? 500 : 100;

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">쿠폰 생성</h2>
            <p className="mt-1 text-xs text-app-muted">
              {type === "access_duration"
                ? "이용권형: 결제 없이 서비스 접근 기간을 지급합니다."
                : type === "percentage_discount"
                  ? "정률 할인형: 결제 금액에서 %만큼 할인되며 Polar Checkout에 연결됩니다."
                  : "정액 할인형: 결제 금액에서 정해진 금액만큼 할인되며 Polar Checkout에 연결됩니다."}
            </p>
          </div>
          <TicketCheck className="text-app-primary" size={22} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="종류">
            <select value={type} onChange={(event) => changeType(event.target.value as CouponType)} className={inputClass}>
              <option value="access_duration">이용권형</option>
              <option value="percentage_discount">정률 할인형</option>
              <option value="fixed_discount">정액 할인형</option>
            </select>
          </Field>
          <Field label="이름">
            <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
          </Field>
          <Field label={quantity > 1 ? "코드(다량 발급 시 자동 생성)" : "코드(비우면 자동 생성)"}>
            <input
              value={code}
              disabled={quantity > 1}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              className={`${inputClass} disabled:bg-slate-50 disabled:text-slate-400`}
              placeholder={quantity > 1 ? "자동 생성" : "WELCOME30"}
            />
          </Field>

          {type === "access_duration" ? (
            <Field label="이용 기간(일)">
              <input type="number" min={1} max={3650} value={accessDays} onChange={(event) => setAccessDays(Number(event.target.value))} className={inputClass} />
            </Field>
          ) : null}

          {type === "percentage_discount" ? (
            <Field label="할인율(%)">
              <input type="number" min={1} max={100} value={value} onChange={(event) => setValue(Math.max(1, Math.min(100, Number(event.target.value))))} className={inputClass} />
            </Field>
          ) : null}

          {type === "fixed_discount" ? (
            <Field label="할인액(원)">
              <input type="number" min={100} step={100} value={value} onChange={(event) => setValue(Number(event.target.value))} className={inputClass} />
            </Field>
          ) : null}

          {type !== "access_duration" ? (
            <Field label="할인 적용 방식">
              <select value={duration} onChange={(event) => setDuration(event.target.value as CouponDuration)} className={inputClass}>
                <option value="once">첫 결제 1회만</option>
                <option value="months">N개월 동안</option>
                <option value="forever">구독 내내</option>
              </select>
            </Field>
          ) : null}

          {type !== "access_duration" && duration === "months" ? (
            <Field label="할인 유지 개월 수">
              <input type="number" min={1} max={36} value={durationMonths} onChange={(event) => setDurationMonths(Number(event.target.value))} className={inputClass} />
            </Field>
          ) : null}

          <Field label={`발급 수량(최대 ${maxQuantity})`}>
            <input
              type="number"
              min={1}
              max={maxQuantity}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Math.min(maxQuantity, Number(event.target.value))))}
              className={inputClass}
            />
          </Field>
          <Field label="코드당 최대 사용 횟수">
            <input type="number" min={1} value={maxRedemptions} onChange={(event) => setMaxRedemptions(Number(event.target.value))} className={inputClass} />
          </Field>
          <Field label="만료일">
            <input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={inputClass} />
          </Field>
        </div>

        <button type="button" disabled={busy} onClick={() => void create()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-app-primary px-5 text-xs font-bold text-white disabled:opacity-50">
          <Plus size={15} />{quantity > 1 ? `쿠폰 ${quantity}장 생성` : "쿠폰 생성"}
        </button>

        {issuedCodes.length ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-amber-800">
                코드 {issuedCodes.length}개가 발급되었습니다. 지금 한 번만 표시되니 꼭 저장하세요.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(issuedCodes.join("\n"))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-app-card px-3 text-[11px] font-bold text-amber-800"
                >
                  <Copy size={13} />전체 복사
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-3 text-[11px] font-bold text-white"
                >
                  <Download size={13} />엑셀(CSV) 다운로드
                </button>
              </div>
            </div>
            <div className="app-scrollbar mt-3 max-h-48 overflow-y-auto rounded-xl bg-app-card p-3">
              {issuedCodes.map((couponCode) => (
                <code key={couponCode} className="block py-0.5 font-mono text-xs font-black">{couponCode}</code>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-amber-700">
              CSV 파일은 엑셀에서 바로 열리며, 카카오톡 쿠폰 대량 등록 양식에 붙여넣을 수 있습니다.
            </p>
          </div>
        ) : null}
        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
      </section>

      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">발급 쿠폰</h2>
          <button type="button" onClick={() => void load()} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border" aria-label="새로고침"><RefreshCcw size={16} /></button>
        </div>
        <div className="app-scrollbar mt-4 overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-app-muted">
              <tr>{["이름", "코드", "종류", "값", "사용량", "만료", "상태"].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-app-border">
                  <td className="px-3 py-4 font-bold">{coupon.name}</td>
                  <td className="px-3 py-4 font-mono">{coupon.codeHint}</td>
                  <td className="px-3 py-4">{TYPE_LABELS[coupon.type] || coupon.type}</td>
                  <td className="px-3 py-4">{coupon.accessDays ? `${coupon.accessDays}일` : coupon.type === "percentage_discount" ? `${coupon.value}%` : `${coupon.value}원`}</td>
                  <td className="px-3 py-4">{coupon.redemptionCount}/{coupon.maxRedemptions}</td>
                  <td className="px-3 py-4">{new Date(coupon.expiresAt).toLocaleDateString("ko-KR")}</td>
                  <td className="px-3 py-4">
                    <button type="button" onClick={() => void toggle(coupon)} className={`min-h-9 rounded-xl px-3 text-[10px] font-bold ${coupon.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {coupon.active ? "활성" : "중지"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-app-muted">{label}</span>{children}</label>; }
