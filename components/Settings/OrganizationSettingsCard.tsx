"use client";

import { Building2, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { OrganizationProfile } from "@/src/lib/settings/organization-profile";

// 설정 > 조직 설정. 은퇴한 비즈니스 페이지에서 이전된 기업 정보(기업명, 로고,
// 산업군, 규모)와 비즈니스 플랜 데이터의 메모리 이전 버튼을 제공한다.
export function OrganizationSettingsCard() {
  const [profile, setProfile] = useState<OrganizationProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [migratedAt, setMigratedAt] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings/organization", { cache: "no-store" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then(
        (body: { profile?: OrganizationProfile; businessPlanMigratedAt?: string | null } | null) => {
          if (body?.profile) setProfile(body.profile);
          setMigratedAt(body?.businessPlanMigratedAt || null);
        }
      )
      .catch(() => undefined);
  }, []);

  function update(patch: Partial<OrganizationProfile>) {
    setProfile((previous) => (previous ? { ...previous, ...patch } : previous));
  }

  async function save() {
    if (!profile) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile)
      });
      if (!response.ok) throw new Error("조직 설정을 저장하지 못했습니다.");
      setNotice("조직 설정을 저장했습니다.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "조직 설정을 저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function migrate() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/organization", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        migrated?: number;
        alreadyMigratedAt?: string | null;
      };
      if (!response.ok) throw new Error("비즈니스 데이터를 가져오지 못했습니다.");
      if (body.alreadyMigratedAt) {
        setNotice("이미 이전이 완료되었습니다.");
        setMigratedAt(body.alreadyMigratedAt);
      } else {
        setNotice(
          `비즈니스 목표·위험·우선순위 ${body.migrated || 0}건을 메모리 검토 목록으로 이전했습니다. 메모리 화면에서 승인하세요.`
        );
        setMigratedAt(new Date().toISOString());
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "비즈니스 데이터를 가져오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
          <Building2 size={19} strokeWidth={1.8} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-app-text">조직 설정</h2>
          <p className="mt-1 text-sm leading-5 text-app-muted">
            기업 기본 정보입니다. AI 결정과 설문의 조직 컨텍스트로 사용됩니다.
          </p>
        </div>
      </div>
      {profile ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldInput label="기업명" value={profile.companyName} onChange={(value) => update({ companyName: value })} />
          <FieldInput label="로고 URL" value={profile.logoUrl} onChange={(value) => update({ logoUrl: value })} />
          <FieldInput label="산업군" value={profile.industry} onChange={(value) => update({ industry: value })} />
          <FieldInput label="규모 (예: 5~200명)" value={profile.size} onChange={(value) => update({ size: value })} />
        </div>
      ) : (
        <p className="text-sm text-app-muted">불러오는 중…</p>
      )}
      {notice ? <p className="mt-3 text-xs font-semibold text-app-primary">{notice}</p> : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !profile}
          onClick={() => void save()}
          className="h-10 rounded-2xl bg-app-primary px-5 text-xs font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          disabled={busy || Boolean(migratedAt)}
          onClick={() => void migrate()}
          className="flex h-10 items-center gap-1.5 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary disabled:opacity-50"
        >
          <Download size={14} />
          {migratedAt ? "비즈니스 데이터 이전 완료" : "비즈니스 데이터를 메모리로 가져오기"}
        </button>
      </div>
    </SurfaceCard>
  );
}

function FieldInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-app-border bg-app-bg p-4">
      <span className="text-[11px] font-semibold text-app-muted">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 h-10 w-full rounded-xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text outline-none transition focus:border-app-primary"
      />
    </label>
  );
}
