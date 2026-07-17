"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Service = { id: string; name: string; configured: boolean };

export function AdminSystemStatus() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void fetch("/api/admin/system/status", { cache: "no-store" }).then(async (response) => { const body = await response.json().catch(() => ({})) as { services?: Service[]; error?: string }; if (!response.ok) throw new Error(body.error || "시스템 상태를 불러오지 못했습니다."); setServices(body.services || []); }).catch((caught) => setError(caught.message)); }, []);
  return <section className="rounded-[22px] border border-app-border bg-white p-5 shadow-soft"><h2 className="text-lg font-bold">시스템 연결 상태</h2><p className="mt-1 text-xs text-app-muted">Railway 환경 변수의 설정 여부만 표시하며 실제 키 값은 서버와 화면 어디에도 노출하지 않습니다.</p>{error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{services.map((service) => <article key={service.id} className="flex items-center gap-3 rounded-2xl border border-app-border p-4">{service.configured ? <CheckCircle2 size={20} className="text-emerald-600" /> : <CircleAlert size={20} className="text-amber-500" />}<div><p className="text-sm font-bold">{service.name}</p><p className={`mt-1 text-[10px] font-semibold ${service.configured ? "text-emerald-600" : "text-amber-600"}`}>{service.configured ? "설정됨" : "설정 필요"}</p></div></article>)}</div></section>;
}

