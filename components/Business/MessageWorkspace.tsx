"use client";

import {
  ExternalLink,
  Loader2,
  Mail,
  RefreshCw,
  Search,
  Send,
  Slack
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BusinessConversation,
  MessageProvider
} from "@/src/lib/business/business-message.service";
import type { ConnectorSyncResult } from "@/src/lib/integrations/types";
import type { OAuthConnectionState } from "@/src/lib/oauth/oauth.types";

type ProviderStatus = {
  connectionState: OAuthConnectionState;
  accountEmail: string | null;
  accountName: string | null;
  workspaceName: string | null;
  scope: string[];
  verifiedAt: string | null;
};

type ResponseData = {
  provider: MessageProvider;
  status: ProviderStatus;
  conversations: BusinessConversation[];
  error?: string;
  code?: string;
};

type SyncResponseData = ResponseData & {
  sync?: ConnectorSyncResult;
};

export function MessageWorkspace() {
  const [provider, setProvider] = useState<MessageProvider>("gmail");
  const [data, setData] = useState<ResponseData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const autoSyncAttempted = useRef(new Set<MessageProvider>());

  const selected =
    data?.conversations.find((item) => item.id === selectedId) ||
    data?.conversations[0] ||
    null;
  const visible = useMemo(
    () =>
      (data?.conversations || []).filter((item) =>
        `${item.title} ${item.subtitle}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [data?.conversations, query]
  );

  useEffect(() => {
    setData(null);
    setSelectedId(null);
    setError(null);
    void load(provider, true);
  }, [provider]);

  async function load(nextProvider: MessageProvider, allowAutoSync: boolean) {
    setBusy(true);
    setError(null);
    let result: ResponseData | null = null;
    try {
      const response = await fetch(
        `/api/business/messages?provider=${nextProvider}`,
        { cache: "no-store" }
      );
      result = (await response.json().catch(() => null)) as ResponseData | null;
      if (!response.ok || !result) {
        throw new Error(result?.error || "메시지를 불러오지 못했습니다.");
      }
      applyData(result);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "메시지를 불러오지 못했습니다."
      );
    } finally {
      setBusy(false);
    }

    if (
      result &&
      allowAutoSync &&
      nextProvider === "gmail" &&
      result.status.connectionState === "connected" &&
      hasGmailReadScope(result.status.scope) &&
      result.conversations.length === 0 &&
      !autoSyncAttempted.current.has(nextProvider)
    ) {
      autoSyncAttempted.current.add(nextProvider);
      await synchronize(nextProvider, true);
    }
  }

  async function synchronize(nextProvider: MessageProvider, automatic = false) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/business/messages/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: nextProvider })
      });
      const result = (await response.json().catch(() => null)) as
        | SyncResponseData
        | null;
      if (result?.conversations && result.status) applyData(result);
      if (!response.ok || !result) {
        throw new Error(
          result?.error ||
            (automatic
              ? "Gmail 자동 동기화에 실패했습니다. 다시 시도해주세요."
              : "대화 동기화에 실패했습니다.")
        );
      }
      if (result.sync?.ranAt) setLastSyncAt(result.sync.ranAt);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "대화 동기화에 실패했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  function applyData(result: ResponseData) {
    setData(result);
    setSelectedId((current) =>
      result.conversations.some((item) => item.id === current)
        ? current
        : result.conversations[0]?.id || null
    );
  }

  async function sendReply() {
    if (!selected || !message.trim()) return;
    if (!window.confirm("이 답장을 전송할까요?")) return;
    setBusy(true);
    setError(null);
    try {
      const latest = selected.messages.at(-1);
      const target =
        provider === "gmail"
          ? extractEmail(latest?.sender || "")
          : selected.id;
      const response = await fetch("/api/business/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          target,
          subject: replySubject(selected.title),
          message,
          threadId: provider === "gmail" ? selected.id : undefined
        })
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(result?.error || "답장을 보내지 못했습니다.");
      }
      setMessage("");
      await synchronize(provider);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "답장을 보내지 못했습니다."
      );
    } finally {
      setBusy(false);
    }
  }

  const connected = data?.status.connectionState === "connected";
  const emptyMessage = error
    ? "동기화 오류를 확인한 뒤 다시 시도해주세요."
    : connected && provider === "gmail" && lastSyncAt
      ? "최근 30일 Gmail 메일이 없습니다."
      : connected
        ? "연결됐지만 아직 동기화된 대화가 없습니다."
        : "계정을 연결하면 대화 목록을 확인할 수 있습니다.";

  return (
    <section className="overflow-hidden rounded-app border border-app-border bg-white shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border p-4">
        <div>
          <h2 className="text-sm font-semibold text-app-text">메일·메시지</h2>
          <p className="mt-1 text-xs text-app-muted">
            연결된 Gmail과 Slack 대화를 확인하고 이 화면에서 답장합니다.
          </p>
          {lastSyncAt ? (
            <p className="mt-1 text-[10px] text-app-muted">
              마지막 동기화 {new Date(lastSyncAt).toLocaleString("ko-KR")}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || !connected}
          onClick={() => void synchronize(provider)}
          className="inline-flex items-center gap-2 rounded-2xl border border-app-border px-3 py-2 text-xs font-semibold text-app-muted disabled:opacity-40"
        >
          <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          동기화
        </button>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void synchronize(provider)}
            className="shrink-0 font-semibold underline"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <div className="grid min-h-[620px] grid-cols-1 xl:grid-cols-[190px_300px_minmax(0,1fr)]">
        <aside className="border-b border-app-border bg-app-bg p-3 xl:border-b-0 xl:border-r">
          <p className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-app-muted">계정</p>
          {([
            ["gmail", "Gmail", Mail],
            ["slack", "Slack", Slack]
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setProvider(id)}
              className={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold ${
                provider === id
                  ? "bg-white text-app-primary shadow-soft"
                  : "text-app-muted hover:bg-white"
              }`}
            >
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
          <div className="mt-4 rounded-2xl border border-app-border bg-white p-3">
            <p className="break-words text-xs font-semibold text-app-text">
              {data?.status.accountEmail ||
                data?.status.workspaceName ||
                data?.status.accountName ||
                "계정 미연결"}
            </p>
            <p className={`mt-1 text-[10px] font-semibold ${connected ? "text-emerald-600" : "text-amber-600"}`}>
              {connected ? "검증 연결됨" : "재연결 필요"}
            </p>
            {!connected ? (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("dreamwish:navigate", {
                      detail: { view: "integrations" }
                    })
                  )
                }
                className="mt-3 inline-flex items-center gap-1 text-[10px] font-semibold text-app-primary"
              >
                연동으로 이동 <ExternalLink size={11} />
              </button>
            ) : null}
          </div>
        </aside>

        <div className="border-b border-app-border p-3 xl:border-b-0 xl:border-r">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-app-border bg-app-bg px-3">
            <Search size={14} className="text-app-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="대화 검색"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </label>
          <div className="mt-3 max-h-[540px] space-y-1 overflow-y-auto">
            {visible.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => setSelectedId(conversation.id)}
                className={`w-full rounded-2xl p-3 text-left ${
                  selected?.id === conversation.id
                    ? "bg-app-hover"
                    : "hover:bg-app-bg"
                }`}
              >
                <p className="truncate text-xs font-semibold text-app-text">{conversation.title}</p>
                <p className="mt-1 truncate text-[11px] text-app-muted">{conversation.subtitle}</p>
                <p className="mt-1 text-[10px] text-app-muted">
                  {new Date(conversation.updatedAt).toLocaleString("ko-KR")}
                </p>
              </button>
            ))}
          </div>
          {!busy && !visible.length ? (
            <p className="px-3 py-10 text-center text-xs leading-5 text-app-muted">{emptyMessage}</p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-app-border px-5 py-4">
            <h3 className="truncate text-sm font-semibold text-app-text">{selected?.title || "대화를 선택하세요"}</h3>
            <p className="mt-1 text-xs text-app-muted">{selected?.subtitle || ""}</p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-app-bg p-5">
            {selected?.messages.map((item) => (
              <article key={item.id} className="max-w-[85%] rounded-2xl border border-app-border bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-semibold text-app-text">{item.sender}</p>
                  <span className="shrink-0 text-[10px] text-app-muted">{new Date(item.receivedAt).toLocaleString("ko-KR")}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-app-text">{item.bodyText || item.bodyPreview}</p>
              </article>
            ))}
            {busy ? (
              <div className="flex justify-center py-8"><Loader2 size={18} className="animate-spin text-app-primary" /></div>
            ) : null}
          </div>
          <div className="border-t border-app-border p-4">
            <textarea
              disabled={!connected || !selected}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={connected ? "답장을 입력하세요" : "계정을 다시 연결해주세요"}
              className="min-h-24 w-full rounded-2xl border border-app-border bg-app-bg p-3 text-sm outline-none focus:border-app-primary disabled:opacity-50"
            />
            <button
              type="button"
              disabled={busy || !connected || !selected || !message.trim()}
              onClick={() => void sendReply()}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-app-primary text-xs font-semibold text-white disabled:opacity-40"
            >
              <Send size={14} /> 답장 보내기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function hasGmailReadScope(scope: string[]) {
  return scope.some(
    (item) =>
      item.includes("gmail.readonly") ||
      item.includes("gmail.modify") ||
      item.includes("mail.google.com")
  );
}

function extractEmail(value: string) {
  return (
    value.match(/<([^>]+@[^>]+)>/u)?.[1] ||
    value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0] ||
    ""
  );
}

function replySubject(subject: string) {
  return /^re:/iu.test(subject) ? subject : `Re: ${subject}`;
}
