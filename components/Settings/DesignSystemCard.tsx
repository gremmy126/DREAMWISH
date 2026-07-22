"use client";

import {
  ChevronDown,
  ChevronRight,
  History,
  Loader2,
  Paintbrush,
  RotateCcw,
  Save
} from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { DESIGN_TOKENS_UPDATED_EVENT } from "@/components/design/DesignTokenOverrides";

// 디자인 시스템 편집기 — DESIGN.md 계약을 보여주고, 색상 토큰을 직접 수정해
// 전체 워크스페이스에 실시간 적용한다. 저장할 때마다 이전 상태가 버전으로
// 남아 언제든 복원할 수 있다.

type DesignToken = {
  name: string;
  cssVariable: string;
  light: string;
  dark: string;
  group: "color" | "radius" | "shadow" | "motion";
  role: string;
};

type TokenOverride = { light: string; dark: string };

type VersionSummary = { versionId: string; note: string; createdAt: string; tokenCount: number };

type DesignSystemPayload = {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  tokens: DesignToken[];
  overrides: Record<string, TokenOverride>;
  overridesCss: string;
  versions: VersionSummary[];
};

const HEX_COLOR = /^#[0-9a-f]{6}$/iu;

export function DesignSystemCard() {
  const [data, setData] = useState<DesignSystemPayload | null>(null);
  const [draft, setDraft] = useState<Record<string, TokenOverride>>({});
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/design/system");
        const body = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          designSystem?: DesignSystemPayload;
        };
        if (response.ok && body.ok && body.designSystem) {
          setData(body.designSystem);
          setDraft(body.designSystem.overrides);
        }
      } catch {
        setData(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function valueFor(token: DesignToken): TokenOverride {
    return draft[token.name] ?? { light: token.light, dark: token.dark };
  }

  function setValue(token: DesignToken, mode: "light" | "dark", value: string) {
    setDraft((current) => ({
      ...current,
      [token.name]: { ...valueFor(token), ...(mode === "light" ? { light: value } : { dark: value }) }
    }));
  }

  const dirty =
    data !== null &&
    JSON.stringify(normalize(draft, data.tokens)) !== JSON.stringify(data.overrides);

  async function applyPatch(body: Record<string, unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/design/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        overrides?: Record<string, TokenOverride>;
        overridesCss?: string;
        versions?: VersionSummary[];
        error?: string;
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "저장에 실패했습니다.");
      setData((current) =>
        current
          ? {
              ...current,
              overrides: payload.overrides ?? {},
              overridesCss: payload.overridesCss ?? "",
              versions: payload.versions ?? []
            }
          : current
      );
      setDraft(payload.overrides ?? {});
      // 전체 워크스페이스에 즉시 반영 (DesignTokenOverrides가 수신).
      window.dispatchEvent(
        new CustomEvent(DESIGN_TOKENS_UPDATED_EVENT, {
          detail: { overridesCss: payload.overridesCss ?? "" }
        })
      );
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SurfaceCard className="p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <Paintbrush size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-app-text">디자인 시스템</h2>
            <p className="mt-1 text-sm leading-5 text-app-muted">
              색상 토큰을 수정하면 전체 워크스페이스에 즉시 적용되고, 이전 상태는
              버전으로 남습니다. AI Agent의 'DW 스타일' 모드도 이 계약을 따릅니다.
            </p>
          </div>
        </div>
        {notice ? (
          <p aria-live="polite" className="shrink-0 rounded-app-md bg-app-primary-soft px-3 py-1.5 text-[11px] font-bold text-app-primary">
            {notice}
          </p>
        ) : null}
      </div>

      {!data ? (
        <p className="py-4 text-center text-xs text-app-muted">불러오는 중…</p>
      ) : (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold text-app-text">색상 토큰 편집</p>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy || Object.keys(data.overrides).length === 0}
                  onClick={() => void applyPatch({ reset: true }, "기본값으로 초기화했습니다.")}
                  className="flex h-8 items-center gap-1 rounded-app-md border border-app-border px-2.5 text-[11px] font-semibold text-app-muted transition hover:text-app-danger disabled:opacity-50"
                >
                  <RotateCcw size={12} />
                  초기화
                </button>
                <button
                  type="button"
                  disabled={busy || !dirty}
                  onClick={() =>
                    void applyPatch(
                      { overrides: normalize(draft, data.tokens) },
                      "저장했습니다. 전체 페이지에 적용되었습니다."
                    )
                  }
                  className="flex h-8 items-center gap-1 rounded-app-md bg-app-primary px-3 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  저장
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {data.tokens
                .filter((token) => token.group === "color")
                .map((token) => {
                  const value = valueFor(token);
                  const overridden = Boolean(data.overrides[token.name]);
                  return (
                    <div
                      key={token.name}
                      className={`rounded-app-md border p-2.5 ${
                        overridden ? "border-app-primary/50 bg-app-primary-soft/40" : "border-app-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-bold text-app-text" title={token.role}>
                          {token.name}
                        </p>
                        {overridden ? (
                          <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wider text-app-primary">
                            수정됨
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <ColorField
                          label="라이트"
                          value={value.light}
                          onChange={(next) => setValue(token, "light", next)}
                        />
                        <ColorField
                          label="다크"
                          value={value.dark}
                          onChange={(next) => setValue(token, "dark", next)}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowVersions((value) => !value)}
              className="flex items-center gap-1.5 text-xs font-semibold text-app-muted transition hover:text-app-primary"
            >
              <History size={13} />
              버전 기록 {showVersions ? "닫기" : `보기 (${data.versions.length})`}
            </button>
            {showVersions ? (
              data.versions.length === 0 ? (
                <p className="mt-2 text-[11px] text-app-muted">아직 저장된 버전이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {data.versions.map((version) => (
                    <li
                      key={version.versionId}
                      className="flex items-center justify-between gap-2 rounded-app-sm bg-app-soft px-3 py-2"
                    >
                      <span className="min-w-0 text-[11px] font-semibold text-app-text">
                        {version.note}
                        <span className="ml-2 text-app-muted">
                          {new Date(version.createdAt).toLocaleString("ko-KR")} · 토큰 {version.tokenCount}개
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void applyPatch(
                            { restoreVersionId: version.versionId },
                            "선택한 버전으로 복원했습니다."
                          )
                        }
                        className="shrink-0 rounded-app-sm border border-app-border px-2.5 py-1 text-[10.5px] font-bold text-app-muted transition hover:text-app-primary disabled:opacity-50"
                      >
                        복원
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold text-app-text">DESIGN.md — {data.title}</p>
            <ul className="space-y-1">
              {data.sections.map((section) => {
                const open = openSection === section.heading;
                return (
                  <li key={section.heading} className="rounded-app-md border border-app-border">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenSection(open ? null : section.heading)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:text-app-primary"
                    >
                      {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      {section.heading}
                    </button>
                    {open ? (
                      <pre className="overflow-x-auto whitespace-pre-wrap border-t border-app-border px-3 py-2 text-[11px] leading-4 text-app-muted app-scrollbar">
                        {section.body}
                      </pre>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

function ColorField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const valid = HEX_COLOR.test(value);
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="shrink-0 text-[10px] font-semibold text-app-muted">{label}</span>
      <input
        type="color"
        aria-label={`${label} 색상 선택`}
        value={valid ? value : "#000000"}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-7 shrink-0 cursor-pointer rounded border border-app-border bg-transparent p-0"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.trim())}
        aria-label={`${label} hex 값`}
        className={`h-7 w-full min-w-0 rounded-app-sm border bg-app-card px-1.5 text-[10.5px] font-semibold uppercase text-app-text outline-none app-tabular-nums ${
          valid ? "border-app-border" : "border-app-danger"
        }`}
      />
    </label>
  );
}

// 기본값과 같은 토큰은 override에서 제외해 저장한다.
function normalize(
  draft: Record<string, TokenOverride>,
  tokens: DesignToken[]
): Record<string, TokenOverride> {
  const output: Record<string, TokenOverride> = {};
  for (const [name, value] of Object.entries(draft)) {
    const base = tokens.find((token) => token.name === name);
    if (!base) continue;
    if (!HEX_COLOR.test(value.light) || !HEX_COLOR.test(value.dark)) continue;
    const light = value.light.toLowerCase();
    const dark = value.dark.toLowerCase();
    if (light === base.light.toLowerCase() && dark === base.dark.toLowerCase()) continue;
    output[name] = { light, dark };
  }
  return output;
}
