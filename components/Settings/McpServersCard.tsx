"use client";

import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plug,
  Plus,
  Power,
  RefreshCw,
  ScrollText,
  Server,
  Trash2,
  Wrench
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";

// MCP 서버 관리 — 등록·연결 테스트·Capability Discovery·Kill Switch·감사 로그.
// Tool/Resource/Prompt 목록은 전부 서버 Discovery 결과이며 하드코딩되지 않는다.

type Capability = { name: string; description?: string; title?: string; uri?: string };

type McpServer = {
  id: string;
  name: string;
  url: string;
  hasAuthToken: boolean;
  status: "unverified" | "connected" | "error" | "disabled";
  lastError: string | null;
  capabilities: {
    serverInfo: { name: string; version: string } | null;
    protocolVersion: string;
    tools: Capability[];
    resources: Capability[];
    prompts: Capability[];
    discoveredAt: string;
  } | null;
  updatedAt: string;
};

type AuditEntry = {
  id: string;
  serverName: string;
  action: string;
  detail: string;
  ok: boolean;
  durationMs: number;
  error: string | null;
  at: string;
};

const STATUS_LABELS: Record<McpServer["status"], { label: string; className: string }> = {
  unverified: { label: "미확인", className: "bg-app-soft text-app-muted" },
  connected: { label: "연결됨", className: "bg-app-success-soft text-app-success" },
  error: { label: "오류", className: "bg-app-danger-soft text-app-danger" },
  disabled: { label: "중지됨", className: "bg-app-warning-soft text-app-warning" }
};

export function McpServersCard() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", authToken: "" });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyServerId, setBusyServerId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp/servers");
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        servers?: McpServer[];
      };
      if (response.ok && body.ok) setServers(body.servers ?? []);
    } catch {
      // 네트워크 오류 시 기존 목록 유지.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addServer() {
    if (formBusy) return;
    setFormBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          url: form.url.trim(),
          authToken: form.authToken.trim() || undefined
        })
      });
      const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!response.ok || !body.ok) throw new Error(body.error || "등록에 실패했습니다.");
      setForm({ name: "", url: "", authToken: "" });
      setShowForm(false);
      await refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "등록에 실패했습니다.");
    } finally {
      setFormBusy(false);
    }
  }

  async function discover(serverId: string) {
    setBusyServerId(serverId);
    try {
      await fetch(`/api/mcp/servers/${serverId}/discover`, { method: "POST" });
    } finally {
      setBusyServerId(null);
      await refresh();
    }
  }

  async function toggleKillSwitch(server: McpServer) {
    setBusyServerId(server.id);
    try {
      await fetch(`/api/mcp/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: server.status === "disabled" ? "unverified" : "disabled" })
      });
    } finally {
      setBusyServerId(null);
      await refresh();
    }
  }

  async function removeServer(serverId: string) {
    setBusyServerId(serverId);
    try {
      await fetch(`/api/mcp/servers/${serverId}`, { method: "DELETE" });
    } finally {
      setBusyServerId(null);
      await refresh();
    }
  }

  async function toggleAudit() {
    if (audit) {
      setAudit(null);
      return;
    }
    try {
      const response = await fetch("/api/mcp/audit?limit=30");
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        entries?: AuditEntry[];
      };
      if (response.ok && body.ok) setAudit(body.entries ?? []);
    } catch {
      setAudit([]);
    }
  }

  return (
    <SurfaceCard className="p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
            <Server size={18} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-app-text">MCP 서버</h2>
            <p className="mt-1 text-sm leading-5 text-app-muted">
              Open Design 등 MCP 서버를 연결하면 AI Agent가 디자인 생성 도구를 사용할 수
              있습니다. 기능 목록은 연결 시 Discovery로 가져옵니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((value) => !value)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-app-md bg-app-primary px-3 text-xs font-bold text-white transition hover:opacity-90"
        >
          <Plus size={13} />
          서버 추가
        </button>
      </div>

      {showForm ? (
        <div className="mb-4 space-y-2 rounded-app-lg border border-app-border bg-app-soft p-4">
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="이름 (예: Open Design)"
            className="h-10 w-full rounded-app-md border border-app-border bg-app-card px-3 text-sm text-app-text outline-none"
          />
          <input
            value={form.url}
            onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
            placeholder="Streamable HTTP URL (예: https://mcp.example.com/mcp)"
            className="h-10 w-full rounded-app-md border border-app-border bg-app-card px-3 text-sm text-app-text outline-none"
          />
          <input
            value={form.authToken}
            onChange={(event) => setForm((prev) => ({ ...prev, authToken: event.target.value }))}
            placeholder="인증 토큰 (선택 — 서버에만 암호화 저장됩니다)"
            type="password"
            autoComplete="off"
            className="h-10 w-full rounded-app-md border border-app-border bg-app-card px-3 text-sm text-app-text outline-none"
          />
          {formError ? <p className="text-xs font-semibold text-app-danger">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-9 rounded-app-md border border-app-border bg-app-card px-3 text-xs font-semibold text-app-muted"
            >
              취소
            </button>
            <button
              type="button"
              disabled={formBusy || !form.name.trim() || !form.url.trim()}
              onClick={() => void addServer()}
              className="flex h-9 items-center gap-1.5 rounded-app-md bg-app-primary px-3 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {formBusy ? <Loader2 size={13} className="animate-spin" /> : <Plug size={13} />}
              등록
            </button>
          </div>
        </div>
      ) : null}

      {!loaded ? (
        <p className="py-6 text-center text-xs text-app-muted">불러오는 중…</p>
      ) : servers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-app-lg border border-dashed border-app-border py-8 text-center">
          <Server size={20} className="text-app-muted" />
          <p className="text-xs font-semibold text-app-text">등록된 MCP 서버가 없습니다</p>
          <p className="max-w-sm text-[11px] leading-4 text-app-muted">
            '서버 추가'로 Streamable HTTP MCP 서버를 등록하세요. 로컬 Open Design
            데몬은 개발 환경에서 MCP_ALLOW_LOCAL=1일 때만 허용됩니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {servers.map((server) => {
            const status = STATUS_LABELS[server.status];
            const expanded = expandedId === server.id;
            const busy = busyServerId === server.id;
            return (
              <li key={server.id} className="rounded-app-lg border border-app-border bg-app-card">
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={`${server.name} 상세`}
                    onClick={() => setExpandedId(expanded ? null : server.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-app-sm text-app-muted transition hover:text-app-primary"
                  >
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-bold text-app-text">
                      {server.name}
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${status.className}`}>
                        {status.label}
                      </span>
                    </p>
                    <p className="truncate text-[11px] text-app-muted">{server.url}</p>
                    {server.lastError ? (
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-app-danger">
                        {server.lastError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy || server.status === "disabled"}
                      onClick={() => void discover(server.id)}
                      title="연결 테스트 + Capability Discovery"
                      className="flex h-8 items-center gap-1 rounded-app-md border border-app-border px-2.5 text-[11px] font-semibold text-app-muted transition hover:text-app-primary disabled:opacity-50"
                    >
                      {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      연결 테스트
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleKillSwitch(server)}
                      title={server.status === "disabled" ? "다시 활성화" : "Kill Switch — 모든 호출 즉시 차단"}
                      className={`flex h-8 w-8 items-center justify-center rounded-app-md border transition disabled:opacity-50 ${
                        server.status === "disabled"
                          ? "border-app-warning text-app-warning"
                          : "border-app-border text-app-muted hover:text-app-warning"
                      }`}
                    >
                      <Power size={12} />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeServer(server.id)}
                      title="서버 삭제"
                      className="flex h-8 w-8 items-center justify-center rounded-app-md border border-app-border text-app-muted transition hover:border-app-danger hover:text-app-danger disabled:opacity-50"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-app-border p-3">
                    {server.capabilities ? (
                      <div className="space-y-3">
                        <p className="text-[11px] text-app-muted">
                          {server.capabilities.serverInfo
                            ? `${server.capabilities.serverInfo.name} v${server.capabilities.serverInfo.version} · `
                            : ""}
                          protocol {server.capabilities.protocolVersion} ·{" "}
                          {new Date(server.capabilities.discoveredAt).toLocaleString("ko-KR")} 기준
                        </p>
                        <CapabilityList
                          title={`Tools (${server.capabilities.tools.length})`}
                          items={server.capabilities.tools.map((tool) => ({
                            key: tool.name,
                            label: tool.name,
                            description: tool.description
                          }))}
                        />
                        <CapabilityList
                          title={`Resources (${server.capabilities.resources.length})`}
                          items={server.capabilities.resources.map((resource) => ({
                            key: resource.uri ?? resource.name ?? "",
                            label: resource.name || resource.uri || "",
                            description: resource.description
                          }))}
                        />
                        <CapabilityList
                          title={`Prompts (${server.capabilities.prompts.length})`}
                          items={server.capabilities.prompts.map((prompt) => ({
                            key: prompt.name,
                            label: prompt.name,
                            description: prompt.description
                          }))}
                        />
                      </div>
                    ) : (
                      <p className="text-[11px] text-app-muted">
                        아직 Discovery 결과가 없습니다. '연결 테스트'를 실행해 주세요.
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 border-t border-app-border pt-3">
        <button
          type="button"
          onClick={() => void toggleAudit()}
          className="flex items-center gap-1.5 text-xs font-semibold text-app-muted transition hover:text-app-primary"
        >
          <ScrollText size={13} />
          감사 로그 {audit ? "닫기" : "보기"}
        </button>
        {audit ? (
          audit.length === 0 ? (
            <p className="mt-2 text-[11px] text-app-muted">기록된 활동이 없습니다.</p>
          ) : (
            <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto app-scrollbar">
              {audit.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-2 rounded-app-sm bg-app-soft px-2 py-1.5 text-[11px] leading-4"
                >
                  <Wrench size={11} className="mt-0.5 shrink-0 text-app-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-app-text">
                      [{entry.serverName}] {entry.action}
                    </span>{" "}
                    <span className="break-all text-app-muted">{entry.detail}</span>
                    {entry.error ? <span className="text-app-danger"> — {entry.error}</span> : null}
                  </span>
                  <span
                    className={`shrink-0 font-bold ${entry.ok ? "text-app-success" : "text-app-danger"}`}
                  >
                    {entry.ok ? "OK" : "FAIL"}
                  </span>
                  <span className="shrink-0 text-app-muted app-tabular-nums">
                    {entry.durationMs}ms
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function CapabilityList({
  title,
  items
}: {
  title: string;
  items: Array<{ key: string; label: string; description?: string }>;
}) {
  if (items.length === 0) {
    return <p className="text-[11px] text-app-muted">{title} — 없음</p>;
  }
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-app-text">{title}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.key} className="rounded-app-sm bg-app-soft px-2 py-1.5">
            <p className="text-[11px] font-semibold text-app-text">{item.label}</p>
            {item.description ? (
              <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-4 text-app-muted">
                {item.description}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
