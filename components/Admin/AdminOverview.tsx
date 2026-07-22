"use client";

import { Activity, ShieldCheck, Trash2, UserCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";

type Overview = {
  totalUsers: number;
  activeUsers: number;
  administrators: number;
  pendingDeletion: number;
  signedInLast24Hours: number;
};

export function AdminOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/admin/overview", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { overview?: Overview; error?: string };
        if (!response.ok || !body.overview) throw new Error(body.error || "관리자 요약을 불러오지 못했습니다.");
        setOverview(body.overview);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "관리자 요약을 불러오지 못했습니다."));
  }, []);

  const cards = [
    { label: "전체 사용자", value: overview?.totalUsers, icon: Users },
    { label: "활성 사용자", value: overview?.activeUsers, icon: UserCheck },
    { label: "관리자", value: overview?.administrators, icon: ShieldCheck },
    { label: "삭제 대기", value: overview?.pendingDeletion, icon: Trash2 },
    { label: "24시간 로그인", value: overview?.signedInLast24Hours, icon: Activity }
  ];
  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-app-border bg-gradient-to-br from-white to-violet-50 p-6 shadow-soft">
        <p className="text-xs font-bold text-app-primary">운영 현황</p>
        <h2 className="mt-2 text-xl font-black tracking-tight sm:text-2xl">서비스 전체 상태를 한곳에서 관리하세요.</h2>
        <p className="mt-2 text-sm text-app-muted">계정, 접근권한, 쿠폰, 자동화 실패와 시스템 설정을 서버 권한 기준으로 확인합니다.</p>
      </section>
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold text-app-muted">{label}</p><Icon size={17} className="text-app-primary" /></div>
            <p className="mt-5 text-2xl font-black sm:text-3xl">{value ?? "—"}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

