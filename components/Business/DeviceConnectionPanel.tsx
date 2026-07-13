"use client";

import { CheckCircle2, Loader2, Pause, Play, RefreshCw, Smartphone, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DevicePlatform, PairedDevice, PairingChallenge } from "@/src/lib/devices/device.types";

export function DeviceConnectionPanel() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [challenge, setChallenge] = useState<PairingChallenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void loadDevices(); }, []);

  async function loadDevices() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/devices");
      const data = (await response.json().catch(() => null)) as { devices?: PairedDevice[]; error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "연결된 휴대폰을 불러오지 못했습니다.");
      setDevices(data?.devices || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "연결된 휴대폰을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function createChallenge(platform: DevicePlatform) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/devices/pairing-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform })
      });
      const data = (await response.json().catch(() => null)) as { challenge?: PairingChallenge; error?: string } | null;
      if (!response.ok || !data?.challenge) throw new Error(data?.error || "페어링 코드를 만들지 못했습니다.");
      setChallenge(data.challenge);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "페어링 코드를 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateDevice(device: PairedDevice, action: "toggle" | "revoke") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/devices/${encodeURIComponent(device.id)}`, action === "revoke" ? {
        method: "DELETE"
      } : {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: device.status === "active" ? "paused" : "active" })
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "기기 상태를 변경하지 못했습니다.");
      await loadDevices();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "기기 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Smartphone size={18} className="text-app-primary" /><h2 className="text-sm font-semibold text-app-text">휴대폰 연결</h2></div>
          <p className="mt-2 text-xs leading-5 text-app-muted">연락처·캘린더와 선택한 매출 알림만 동기화합니다. SMS와 통화 기록은 수집하지 않습니다.</p>
        </div>
        <button type="button" onClick={() => void loadDevices()} className="inline-flex items-center gap-2 rounded-2xl border border-app-border px-3 py-2 text-xs font-semibold text-app-muted hover:bg-app-hover"><RefreshCw size={13} />새로고침</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={busy} onClick={() => void createChallenge("android")} className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left disabled:opacity-50"><span><span className="block text-sm font-semibold text-emerald-900">Android 연결</span><span className="mt-1 block text-xs text-emerald-700">연락처·캘린더·허용 앱 알림</span></span><Smartphone size={20} /></button>
        <button type="button" disabled={busy} onClick={() => void createChallenge("ios")} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left disabled:opacity-50"><span><span className="block text-sm font-semibold text-slate-900">iPhone 연결</span><span className="mt-1 block text-xs text-slate-600">연락처·캘린더·공유 확장</span></span><Smartphone size={20} /></button>
      </div>

      {error ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {loading ? <div className="flex justify-center py-6 text-app-muted"><Loader2 size={18} className="animate-spin" /></div> : null}
      {!loading && devices.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-app-border py-6 text-center text-xs text-app-muted">연결된 휴대폰이 없습니다.</p> : null}
      <div className="mt-4 space-y-2">
        {devices.map((device) => (
          <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg p-3">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-app-primary"><Smartphone size={17} /></span><span><span className="flex items-center gap-2 text-sm font-semibold text-app-text">{device.name}{device.status === "active" ? <CheckCircle2 size={13} className="text-emerald-600" /> : null}</span><span className="mt-1 block text-[11px] text-app-muted">{device.platform === "android" ? "Android" : "iPhone"} · 마지막 동기화 {device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString("ko-KR") : "아직 없음"}</span></span></div>
            <div className="flex gap-2"><button type="button" disabled={busy || device.status === "revoked"} onClick={() => void updateDevice(device, "toggle")} className="rounded-xl border border-app-border bg-white p-2 text-app-muted">{device.status === "active" ? <Pause size={14} /> : <Play size={14} />}</button><button type="button" disabled={busy || device.status === "revoked"} onClick={() => void updateDevice(device, "revoke")} className="rounded-xl border border-red-200 bg-white p-2 text-red-600"><Trash2 size={14} /></button></div>
          </div>
        ))}
      </div>

      {challenge ? <PairingDialog challenge={challenge} onClose={() => { setChallenge(null); void loadDevices(); }} /> : null}
    </section>
  );
}

function PairingDialog({ challenge, onClose }: { challenge: PairingChallenge; onClose: () => void }) {
  const payload = JSON.stringify({ version: 1, challengeId: challenge.id, code: challenge.code, platform: challenge.platform, apiBaseUrl: window.location.origin });
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4">
      <section role="dialog" aria-modal="true" aria-labelledby="pairing-title" className="w-full max-w-md rounded-app border border-app-border bg-white p-6 shadow-app">
        <div className="flex items-start justify-between gap-3"><div><h3 id="pairing-title" className="text-lg font-semibold text-app-text">{challenge.platform === "android" ? "Android" : "iPhone"} 페어링</h3><p className="mt-1 text-xs text-app-muted">컴패니언 앱에서 아래 6자리 코드를 입력하세요.</p></div><button type="button" onClick={onClose} className="rounded-xl border border-app-border p-2 text-app-muted"><X size={15} /></button></div>
        <div className="my-5 rounded-3xl bg-slate-950 px-5 py-6 text-center font-mono text-4xl font-bold tracking-[0.35em] text-white">{challenge.code}</div>
        <p className="text-center text-xs text-app-muted">{new Date(challenge.expiresAt).toLocaleTimeString("ko-KR")}까지 유효 · 1회 사용</p>
        <details className="mt-4 rounded-2xl border border-app-border bg-app-bg p-3"><summary className="cursor-pointer text-xs font-semibold text-app-text">수동 페어링 정보</summary><pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-all text-[10px] text-app-muted">{payload}</pre></details>
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">스토어 서명 앱이 아직 배포되지 않은 환경에서는 컴패니언 소스 빌드와 사용자 소유 Apple/Google 서명 자격증명이 필요합니다.</div>
      </section>
    </div>
  );
}
