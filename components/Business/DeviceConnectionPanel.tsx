"use client";

import { CheckCircle2, Loader2, Pause, Play, RefreshCw, Smartphone, Trash2, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DevicePlatform, PairedDevice } from "@/src/lib/devices/device.types";

type PairingSession = {
  apiVersion: number;
  sessionId: string;
  pairingUrl: string;
  fallbackUrl: string;
  expiresAt: string;
};

type PairingUiState =
  | "idle"
  | "creating"
  | "awaiting_phone"
  | "awaiting_web_code"
  | "active"
  | "expired"
  | "error";

const POLL_INTERVAL_MS = 2_500;

export function DeviceConnectionPanel() {
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<{ platform: DevicePlatform; value: PairingSession } | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

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

  async function createSession(platform: DevicePlatform, opener: HTMLButtonElement | null) {
    setBusy(true);
    setError(null);
    openerRef.current = opener;
    try {
      const response = await fetch("/api/devices/pairing-challenges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform })
      });
      const data = (await response.json().catch(() => null)) as (PairingSession & { error?: { message?: string } }) | null;
      if (!response.ok || !data?.sessionId) {
        throw new Error(data?.error?.message || "페어링 세션을 만들지 못했습니다.");
      }
      setSession({ platform, value: data });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "페어링 세션을 만들지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function closePairing() {
    setSession(null);
    openerRef.current?.focus();
    void loadDevices();
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
          <p className="mt-2 text-xs leading-5 text-app-muted">연락처·캘린더와 사용자가 선택한 매출 신호만 동기화합니다. SMS와 통화 기록은 수집하지 않습니다.</p>
        </div>
        <button type="button" onClick={() => void loadDevices()} className="inline-flex items-center gap-2 rounded-2xl border border-app-border px-3 py-2 text-xs font-semibold text-app-muted hover:bg-app-hover"><RefreshCw size={13} />새로고침</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy}
          onClick={(event) => void createSession("android", event.currentTarget)}
          className="flex min-h-[44px] items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left disabled:opacity-50"
        >
          <span><span className="block text-sm font-semibold text-emerald-900">Android 연결</span><span className="mt-1 block text-xs text-emerald-700">연락처·캘린더·허용한 앱 알림 수집</span></span>
          <Smartphone size={20} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(event) => void createSession("ios", event.currentTarget)}
          className="flex min-h-[44px] items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left disabled:opacity-50"
        >
          <span><span className="block text-sm font-semibold text-slate-900">iPhone 연결</span><span className="mt-1 block text-xs text-slate-600">연락처·캘린더·직접 공유한 매출 텍스트</span></span>
          <Smartphone size={20} />
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-app-muted">iPhone은 다른 앱의 알림을 자동으로 읽을 수 없어 공유 확장으로 직접 공유한 내용만 수집합니다. Android는 사용자가 알림 접근을 허용한 앱의 알림만 수집합니다.</p>

      {error ? <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      {loading ? <div className="flex justify-center py-6 text-app-muted"><Loader2 size={18} className="animate-spin" /></div> : null}
      {!loading && devices.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-app-border py-6 text-center text-xs text-app-muted">연결된 휴대폰이 없습니다.</p> : null}
      <div className="mt-4 space-y-2">
        {devices.map((device) => (
          <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg p-3">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-app-primary"><Smartphone size={17} /></span><span><span className="flex items-center gap-2 text-sm font-semibold text-app-text">{device.name}{device.status === "active" ? <CheckCircle2 size={13} className="text-emerald-600" /> : null}</span><span className="mt-1 block text-[11px] text-app-muted">{device.platform === "android" ? "Android" : "iPhone"} · 마지막 동기화 {device.lastSyncAt ? new Date(device.lastSyncAt).toLocaleString("ko-KR") : "아직 없음"}</span></span></div>
            <div className="flex gap-2"><button type="button" disabled={busy || device.status === "revoked"} onClick={() => void updateDevice(device, "toggle")} className="min-h-[44px] min-w-[44px] rounded-xl border border-app-border bg-white p-2 text-app-muted">{device.status === "active" ? <Pause size={14} /> : <Play size={14} />}</button><button type="button" disabled={busy || device.status === "revoked"} onClick={() => void updateDevice(device, "revoke")} className="min-h-[44px] min-w-[44px] rounded-xl border border-red-200 bg-white p-2 text-red-600"><Trash2 size={14} /></button></div>
          </div>
        ))}
      </div>

      {session ? <QrPairingDialog platform={session.platform} session={session.value} onClose={closePairing} /> : null}
    </section>
  );
}

function QrPairingDialog({ platform, session, onClose }: {
  platform: DevicePlatform;
  session: PairingSession;
  onClose: () => void;
}) {
  const [uiState, setUiState] = useState<PairingUiState>("awaiting_phone");
  const [code, setCode] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntil(session.expiresAt));
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const publicToken = extractPublicToken(session.fallbackUrl);
  const platformLabel = platform === "android" ? "Android" : "iPhone";

  const stopPolling = uiState === "active" || uiState === "expired" || uiState === "error";

  const pollStatus = useCallback(async (signal: AbortSignal) => {
    if (!publicToken) return;
    try {
      const response = await fetch(`/api/devices/pairing-challenges/${encodeURIComponent(session.sessionId)}/status`, {
        headers: { Authorization: `Bearer ${publicToken}` },
        signal
      });
      const data = (await response.json().catch(() => null)) as { status?: string } | null;
      if (!response.ok || !data?.status) return;
      if (data.status === "awaiting_confirmation") setUiState((current) => (current === "awaiting_phone" ? "awaiting_web_code" : current));
      else if (data.status === "active") setUiState("active");
      else if (data.status === "expired") setUiState("expired");
      else if (data.status === "locked") setUiState("error");
    } catch {
      // 네트워크 오류는 다음 폴링에서 다시 시도합니다.
    }
  }, [publicToken, session.sessionId]);

  useEffect(() => {
    if (stopPolling) return;
    const controller = new AbortController();
    const interval = setInterval(() => { void pollStatus(controller.signal); }, POLL_INTERVAL_MS);
    void pollStatus(controller.signal);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [pollStatus, stopPolling]);

  useEffect(() => {
    if (stopPolling) return;
    const timer = setInterval(() => {
      const remaining = secondsUntil(session.expiresAt);
      setRemainingSeconds(remaining);
      if (remaining <= 0) setUiState("expired");
    }, 1_000);
    return () => clearInterval(timer);
  }, [session.expiresAt, stopPolling]);

  useEffect(() => {
    if (uiState === "awaiting_web_code") codeInputRef.current?.focus();
  }, [uiState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !submitting) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, submitting]);

  async function submitCode() {
    if (submitting || !/^\d{6}$/u.test(code)) return;
    setSubmitting(true);
    setConfirmError(null);
    try {
      const response = await fetch(`/api/devices/pairing-challenges/${encodeURIComponent(session.sessionId)}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = (await response.json().catch(() => null)) as { device?: unknown; error?: { code?: string; message?: string } } | null;
      if (!response.ok) {
        const errorCode = data?.error?.code || "";
        if (errorCode === "PAIRING_CODE_ATTEMPTS_EXCEEDED") {
          setUiState("error");
          setConfirmError("코드를 5회 잘못 입력해 이 세션이 잠겼습니다. 새 QR 코드로 다시 시도하세요.");
        } else if (errorCode === "PAIRING_EXPIRED") {
          setUiState("expired");
        } else {
          setConfirmError(data?.error?.message || "코드가 올바르지 않습니다. 휴대폰 화면의 6자리를 다시 확인하세요.");
        }
        return;
      }
      setUiState("active");
    } catch {
      setConfirmError("네트워크 오류로 확인하지 못했습니다. 다시 시도하세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4">
      <section role="dialog" aria-modal="true" aria-labelledby="pairing-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-app border border-app-border bg-white p-6 shadow-app">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="pairing-title" className="text-lg font-semibold text-app-text">{platformLabel} 휴대폰 연결</h3>
            <p className="mt-1 text-xs text-app-muted">휴대폰 기본 카메라로 아래 QR 코드를 스캔하세요.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-11 w-11 items-center justify-center rounded-xl border border-app-border text-app-muted"><X size={15} /></button>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {uiState === "awaiting_phone" ? "휴대폰 스캔을 기다리는 중" : null}
          {uiState === "awaiting_web_code" ? "휴대폰에 표시된 6자리 코드를 입력하세요" : null}
          {uiState === "active" ? "휴대폰이 연결되었습니다" : null}
          {uiState === "expired" ? "QR 코드가 만료되었습니다" : null}
          {uiState === "error" ? "페어링에 실패했습니다" : null}
        </p>

        {uiState === "awaiting_phone" ? (
          <>
            <div className="my-5 flex justify-center rounded-3xl border border-app-border bg-white p-5">
              <QRCodeSVG value={session.fallbackUrl} size={208} marginSize={2} aria-label="휴대폰 연결 QR 코드" />
            </div>
            <p className="text-center text-xs text-app-muted">남은 시간 {formatRemaining(remainingSeconds)} · 1회 사용</p>
            <div className="mt-4 rounded-2xl border border-app-border bg-app-bg p-4 text-xs leading-6 text-app-text">
              <ol className="list-decimal space-y-1 pl-5">
                <li>{platformLabel} 기본 카메라 앱을 엽니다.</li>
                <li>이 QR 코드를 스캔하면 DREAMWISH Companion 앱이 열립니다.</li>
                <li>앱이 없으면 열린 웹 페이지의 안내에 따라 앱을 설치한 뒤 다시 스캔합니다.</li>
                <li>휴대폰 화면에 6자리 확인 코드가 표시됩니다.</li>
                <li>그 6자리 코드를 이 화면에 입력해 연결을 승인합니다.</li>
              </ol>
              <p className="mt-3 rounded-xl bg-violet-50 px-3 py-2 font-semibold text-violet-800">확인 코드는 휴대폰 화면에 표시되고, 입력은 이 웹 화면에서 합니다.</p>
            </div>
          </>
        ) : null}

        {uiState === "awaiting_web_code" ? (
          <div className="my-5">
            <p className="text-sm font-semibold text-app-text">휴대폰에 표시된 6자리 코드를 입력하세요.</p>
            <p className="mt-1 text-xs text-app-muted">남은 시간 {formatRemaining(remainingSeconds)}</p>
            <div className="mt-3 flex gap-2">
              <input
                ref={codeInputRef}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                aria-label="휴대폰에 표시된 6자리 확인 코드"
                className="h-12 flex-1 rounded-2xl border border-app-border px-4 text-center font-mono text-xl tracking-[0.4em] text-app-text"
                placeholder="000000"
              />
              <button
                type="button"
                onClick={() => void submitCode()}
                disabled={submitting || code.length !== 6}
                className="h-12 rounded-2xl bg-app-primary px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : "연결 승인"}
              </button>
            </div>
            {confirmError ? <p className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{confirmError}</p> : null}
          </div>
        ) : null}

        {uiState === "active" ? (
          <div className="my-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600" />
            <p className="mt-2 text-sm font-semibold text-emerald-900">휴대폰이 연결되었습니다.</p>
            <p className="mt-1 text-xs text-emerald-700">휴대폰 앱에서 연락처·캘린더 권한을 허용하면 동기화가 시작됩니다.</p>
            <button type="button" onClick={onClose} className="mt-4 h-11 rounded-2xl bg-emerald-600 px-6 text-sm font-semibold text-white">완료</button>
          </div>
        ) : null}

        {uiState === "expired" || uiState === "error" ? (
          <div className="my-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-sm font-semibold text-amber-900">{uiState === "expired" ? "QR 코드가 만료되었습니다." : "페어링에 실패했습니다."}</p>
            <p className="mt-1 text-xs text-amber-700">창을 닫고 새 QR 코드를 만들어 다시 시도하세요.</p>
            <button type="button" onClick={onClose} className="mt-4 h-11 rounded-2xl border border-amber-300 bg-white px-6 text-sm font-semibold text-amber-900">닫기</button>
          </div>
        ) : null}

        {platform === "ios" ? (
          <p className="mt-2 rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-[11px] leading-5 text-app-muted">iPhone에서는 은행 알림을 자동으로 읽을 수 없습니다. 매출 텍스트는 공유 확장으로 직접 공유한 경우에만 수집됩니다.</p>
        ) : null}
      </section>
    </div>
  );
}

function extractPublicToken(fallbackUrl: string) {
  try {
    return new URL(fallbackUrl).searchParams.get("token");
  } catch {
    return null;
  }
}

function secondsUntil(expiresAt: string) {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1_000));
}

function formatRemaining(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
