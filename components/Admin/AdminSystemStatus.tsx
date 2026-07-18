"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type Service = {
  id: string;
  name: string;
  configured: boolean;
  health?: "not_configured" | "offline" | "healthy";
  lastSeenAt?: string | null;
  lastSeenAgeSeconds?: number | null;
  version?: string | null;
  versionCompatible?: boolean | null;
  capabilities?: string[];
  provider?: string;
  mode?: string;
  missingVariables?: string[];
};

export function AdminSystemStatus() {
  const [services, setServices] = useState<Service[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/admin/system/status", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => ({})) as { services?: Service[]; error?: string };
        if (!response.ok) throw new Error(body.error || "시스템 상태를 불러오지 못했습니다.");
        setServices(body.services || []);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "시스템 상태를 불러오지 못했습니다."));
  }, []);

  return (
    <section className="rounded-[22px] border border-app-border bg-white p-5 shadow-soft">
      <h2 className="text-lg font-bold">시스템 연결 상태</h2>
      <p className="mt-1 text-xs text-app-muted">
        설정 여부와 실제 Worker heartbeat를 구분해 표시합니다. 환경 변수 값과 Worker 식별자는 노출하지 않습니다.
      </p>
      {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => {
          const worker = service.id === "automation" || service.id === "billing-worker";
          const healthy = worker ? service.health === "healthy" : service.configured;
          return (
            <article key={service.id} className="flex items-start gap-3 rounded-2xl border border-app-border p-4">
              {healthy
                ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />
                : <CircleAlert size={20} className="mt-0.5 shrink-0 text-amber-500" />}
              <div className="min-w-0">
                <p className="text-sm font-bold">{service.name}</p>
                <p className={`mt-1 text-[10px] font-semibold ${healthy ? "text-emerald-600" : "text-amber-600"}`}>
                  {statusLabel(service)}
                </p>
                {worker && service.configured ? (
                  <div className="mt-2 space-y-1 text-[10px] text-app-muted">
                    <p>최근 확인: {service.lastSeenAgeSeconds === null || service.lastSeenAgeSeconds === undefined ? "없음" : `${service.lastSeenAgeSeconds}초 전`}</p>
                    <p>버전: {service.version || "확인 불가"}{service.versionCompatible === false ? " (호환되지 않음)" : ""}</p>
                    <p className="break-words">기능: {service.capabilities?.join(", ") || "확인 불가"}</p>
                  </div>
                ) : null}
                {service.id === "domestic-billing" ? (
                  <div className="mt-2 space-y-1 text-[10px] text-app-muted">
                    <p>모드: {service.mode || "확인 불가"}</p>
                    <p>공급자: {service.provider || "확인 불가"}</p>
                    {!service.configured ? <p className="break-words">누락: {service.missingVariables?.join(", ") || "확인 불가"}</p> : null}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function statusLabel(service: Service) {
  if (service.id !== "automation" && service.id !== "billing-worker") return service.configured ? "설정됨" : "설정 필요";
  if (service.health === "healthy") return "정상 (healthy)";
  if (service.health === "offline") return "설정됐지만 오프라인 (configured but offline)";
  return "설정 필요 (not configured)";
}
