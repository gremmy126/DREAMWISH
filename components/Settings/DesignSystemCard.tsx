"use client";

import { ChevronDown, ChevronRight, Paintbrush } from "lucide-react";
import { useEffect, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

// 디자인 시스템 뷰어 — design-system/DESIGN.md 계약과 실제 적용 중인 토큰을
// 보여준다. 토큰 값은 globals.css의 CSS 변수 그대로이며, 여기 표시되는
// 색이 곧 전체 페이지에 적용된 색이다.

type DesignToken = {
  name: string;
  cssVariable: string;
  light: string;
  dark: string;
  group: "color" | "radius" | "shadow" | "motion";
  role: string;
};

type DesignSystemPayload = {
  title: string;
  sections: Array<{ heading: string; body: string }>;
  tokens: DesignToken[];
};

export function DesignSystemCard() {
  const [data, setData] = useState<DesignSystemPayload | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/design/system");
        const body = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          designSystem?: DesignSystemPayload;
        };
        if (response.ok && body.ok && body.designSystem) setData(body.designSystem);
      } catch {
        setData(null);
      }
    })();
  }, []);

  return (
    <SurfaceCard className="p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
          <Paintbrush size={18} />
        </div>
        <div>
          <h2 className="text-base font-semibold text-app-text">디자인 시스템</h2>
          <p className="mt-1 text-sm leading-5 text-app-muted">
            모든 페이지와 AI 생성 결과물이 따르는 DESIGN.md 계약과 디자인 토큰입니다.
            AI Agent의 'DW 스타일' 모드가 이 계약을 사용합니다.
          </p>
        </div>
      </div>

      {!data ? (
        <p className="py-4 text-center text-xs text-app-muted">불러오는 중…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold text-app-text">색상 토큰</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {data.tokens
                .filter((token) => token.group === "color")
                .map((token) => (
                  <div
                    key={token.name}
                    className="flex items-center gap-2 rounded-app-md border border-app-border p-2"
                  >
                    <span
                      aria-hidden
                      className="h-7 w-7 shrink-0 rounded-app-sm border border-app-border"
                      style={{ background: token.light }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-bold text-app-text">
                        {token.name}
                      </span>
                      <span className="block text-[10px] uppercase text-app-muted app-tabular-nums">
                        {token.light}
                      </span>
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="grid gap-2 text-[11px] text-app-muted sm:grid-cols-3">
            <p className="rounded-app-md bg-app-soft p-2.5">
              <span className="font-bold text-app-text">Radius</span> — 8 / 12 / 16 / 18px
            </p>
            <p className="rounded-app-md bg-app-soft p-2.5">
              <span className="font-bold text-app-text">Spacing</span> — 4px 기반 scale
            </p>
            <p className="rounded-app-md bg-app-soft p-2.5">
              <span className="font-bold text-app-text">Motion</span> — 150–250ms, reduced-motion 지원
            </p>
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
