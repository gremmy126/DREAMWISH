"use client";

import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PortOneV1BillingCheckout } from "@/components/billing/PortOneV1BillingCheckout";
import { PortOneV2Checkout } from "@/components/billing/PortOneV2Checkout";

type ProviderId = "portone_kpn_v2" | "portone_kcp_v1";
type Readiness = { ready: boolean; recurringReady: boolean; generalReady?: boolean; missingVariables: string[] };
type ProviderStatus = {
  mode: "sandbox" | "live"; primaryProvider: ProviderId;
  providers: Record<ProviderId, Readiness>;
  webhooks: { v2Ready: boolean; missingVariables: string[] };
};
type RefundablePayment = {
  attemptId: string;
  ownerId: string;
  provider: ProviderId;
  providerPaymentId: string;
  amount: number;
  refundedAmount: number;
  remainingAmount: number;
  currency: "KRW";
  orderName: string;
  verifiedAt: string | null;
};

export function AdminBillingPanel() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [payments, setPayments] = useState<RefundablePayment[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    const [response, paymentsResponse] = await Promise.all([
      fetch("/api/admin/billing/providers", { cache: "no-store" }),
      fetch("/api/admin/billing/refunds", { cache: "no-store" })
    ]);
    const payload = await response.json().catch(() => null);
    const paymentsPayload = await paymentsResponse.json().catch(() => null) as { payments?: RefundablePayment[] } | null;
    if (response.ok) setStatus(payload as ProviderStatus);
    else setMessage("결제 공급자 상태를 불러오지 못했습니다.");
    if (paymentsResponse.ok) setPayments(paymentsPayload?.payments || []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function selectProvider(provider: ProviderId) {
    if (!window.confirm("새로 생성되는 구독에만 적용됩니다. 결제 공급자를 변경할까요?")) return;
    const response = await fetch("/api/admin/billing/providers", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, confirmation: "NEW_SUBSCRIPTIONS_ONLY" })
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) setMessage(payload?.error || "공급자를 변경하지 못했습니다.");
    else { setMessage("기본 공급자를 변경했습니다. 기존 구독은 변경되지 않습니다."); await load(); }
  }

  if (loading) return <div className="flex min-h-40 items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!status) return <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4"><RefreshCw size={15} /> 다시 시도</button>;
  return (
    <section className="space-y-5">
      <div className="rounded-[24px] border border-app-border bg-app-card p-6 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-app-primary">Domestic billing</p>
        <h2 className="mt-2 text-xl font-bold">국내 결제 운영</h2>
        <p className="mt-2 text-sm text-app-muted">현재 모드: {status.mode}. 공급자 전환은 새 구독에만 적용되며 자동 폴백은 없습니다.</p>
        {message ? <p role="status" className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">{message}</p> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderCard name="KPN" status={status.providers.portone_kpn_v2} selected={status.primaryProvider === "portone_kpn_v2"} onSelect={() => void selectProvider("portone_kpn_v2")} />
        <ProviderCard name="NHN KCP" status={status.providers.portone_kcp_v1} selected={status.primaryProvider === "portone_kcp_v1"} onSelect={() => void selectProvider("portone_kcp_v1")} />
      </div>
      {status.mode === "sandbox" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-app-border bg-app-card p-5 shadow-soft">
            <h3 className="mb-3 font-bold">KPN Sandbox</h3>
            {status.providers.portone_kpn_v2.ready ? <PortOneV2Checkout mode="sandbox" onComplete={setMessage} /> : <Missing names={status.providers.portone_kpn_v2.missingVariables} />}
          </div>
          <div className="rounded-[24px] border border-app-border bg-app-card p-5 shadow-soft">
            <h3 className="mb-3 font-bold">NHN KCP V1 Sandbox</h3>
            {status.providers.portone_kcp_v1.ready ? <PortOneV1BillingCheckout onComplete={setMessage} /> : <Missing names={status.providers.portone_kcp_v1.missingVariables} />}
          </div>
        </div>
      ) : null}
      <section className="rounded-[24px] border border-app-border bg-app-card p-5 shadow-soft">
        <div>
          <h3 className="font-bold">결제 및 환불</h3>
          <p className="mt-1 text-xs leading-5 text-app-muted">운영 결제만 표시됩니다. 누적 환불 가능액을 서버에서 다시 잠그고 검사한 뒤 처리합니다.</p>
        </div>
        <div className="mt-4 space-y-3">
          {payments.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-app-muted">환불 가능한 운영 결제가 없습니다.</p> : payments.map((payment) => (
            <PaymentRefundRow key={payment.attemptId} payment={payment} onDone={async (nextMessage) => { setMessage(nextMessage); await load(); }} />
          ))}
        </div>
      </section>
    </section>
  );
}

function PaymentRefundRow({ payment, onDone }: { payment: RefundablePayment; onDone: (message: string) => Promise<void> }) {
  const [amount, setAmount] = useState(payment.remainingAmount);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const phrase = `REFUND ${payment.providerPaymentId}`;

  async function refund() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/billing/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          amount,
          reason,
          confirmation
        })
      });
      const payload = await response.json().catch(() => null) as { pending?: boolean; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "환불을 완료하지 못했습니다.");
      await onDone(payload?.pending ? "환불 요청이 공급자에서 처리 중입니다." : "환불이 확인되었습니다.");
    } catch (error) {
      await onDone(error instanceof Error ? error.message : "환불을 완료하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-app-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-bold break-all">{payment.providerPaymentId}</p>
          <p className="mt-1 text-xs text-app-muted">{payment.provider} · {payment.orderName} · 잔액 {payment.remainingAmount.toLocaleString("ko-KR")}원</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">{payment.refundedAmount.toLocaleString("ko-KR")}원 환불됨</span>
      </div>
      {payment.remainingAmount > 0 ? <div className="mt-4 grid gap-3 lg:grid-cols-[140px_1fr_1.4fr_auto]">
        <input aria-label="환불 금액" type="number" min={1} max={payment.remainingAmount} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="min-h-11 rounded-xl border border-app-border px-3 text-sm" />
        <input aria-label="환불 사유" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="환불 사유" className="min-h-11 rounded-xl border border-app-border px-3 text-sm" />
        <input aria-label="환불 확인 문구" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={phrase} className="min-h-11 rounded-xl border border-app-border px-3 font-mono text-xs" />
        <button type="button" disabled={busy || reason.trim().length < 3 || confirmation !== phrase || amount < 1 || amount > payment.remainingAmount} onClick={() => void refund()} className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40">
          {busy ? "처리 중" : "환불"}
        </button>
      </div> : null}
    </article>
  );
}

function ProviderCard({ name, status, selected, onSelect }: { name: string; status: Readiness; selected: boolean; onSelect: () => void }) {
  return (
    <article className="rounded-[24px] border border-app-border bg-app-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{name}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${status.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {status.ready ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}{status.ready ? "준비됨" : "설정 필요"}
        </span>
      </div>
      {!status.ready ? <Missing names={status.missingVariables} /> : null}
      <button type="button" disabled={selected || !status.ready} onClick={onSelect} className="mt-4 min-h-11 w-full rounded-xl border border-app-border px-4 text-sm font-bold disabled:opacity-50">
        {selected ? "새 구독 기본값" : "새 구독 기본값으로 설정"}
      </button>
    </article>
  );
}

function Missing({ names }: { names: string[] }) {
  return <p className="mt-3 text-xs leading-5 text-amber-700">missingVariables: {names.join(", ") || "없음"}</p>;
}
