"use client";

import {
  Bot,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  FolderCheck,
  HardDriveDownload,
  ImageDown,
  Loader2,
  Monitor,
  RotateCcw,
  Send,
  Smartphone,
  Sparkles,
  Tablet,
  Undo2,
  Wand2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AGENT_DEFAULT_FILENAMES,
  AGENT_KIND_LABELS,
  classifyAgentRequest,
  kindFromFileName,
  type AgentBuildKind
} from "@/src/lib/agent/agent-build";

type AgentChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
};

type Artifact = {
  kind: AgentBuildKind;
  code: string;
  fileName: string;
};

// File System Access API 최소 타입 (Chromium 전용, lib.dom 미포함 부분).
type FsWritable = { write(data: string): Promise<void>; close(): Promise<void> };
type FsFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
};
type FsDirectoryHandle = {
  kind: "directory";
  name: string;
  values(): AsyncIterable<FsFileHandle | FsDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
};
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<FsDirectoryHandle>;
};

const EDITABLE_EXTENSIONS = /\.(html?|svg|jsx?|tsx?|mjs|cjs|py|css|json|txt|md)$/iu;
const MAX_LOAD_BYTES = 2_000_000;

const EXAMPLE_PROMPTS = [
  "카페 브랜드 랜딩 페이지 만들어줘",
  "마감일 있는 할 일 앱 만들어줘",
  "보라색 별 모양 로고 그려줘",
  "CSV 파일을 합치는 스크립트 짜줘"
];

let agentSeq = 0;
function nextId() {
  agentSeq += 1;
  return `a-${Date.now()}-${agentSeq}`;
}

// AI Agent 스튜디오 — 채팅으로 "웹사이트 만들어줘"처럼 말하면 종류를
// 추론해 생성하고, 옆 미리보기에서 즉시 확인·수정한다. 내 PC 폴더를
// 연결하면(Chromium 브라우저) 생성물을 폴더에 저장하고 기존 파일을
// 불러와 수정할 수 있다.
export function AgentStudio() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [directory, setDirectory] = useState<FsDirectoryHandle | null>(null);
  const [folderFiles, setFolderFiles] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [providerOptions, setProviderOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  // 이전 결과물 버전 스택 — '되돌리기'로 언제든 직전 버전으로 복귀한다.
  const [versions, setVersions] = useState<Artifact[]>([]);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  function applyArtifact(next: Artifact) {
    setArtifact((current) => {
      if (current) setVersions((stack) => [...stack.slice(-9), current]);
      return next;
    });
    setShowCode(false);
  }

  function undoArtifact() {
    setVersions((stack) => {
      const previous = stack[stack.length - 1];
      if (!previous) return stack;
      setArtifact(previous);
      pushAi("이전 버전으로 되돌렸습니다.");
      return stack.slice(0, -1);
    });
  }

  function resetChat() {
    setMessages([]);
    setArtifact(null);
    setVersions([]);
    setInput("");
    setShowCode(false);
  }

  // 가장 성능 좋은 공급자를 고를 수 있게 연결된 모델 목록을 불러온다.
  useEffect(() => {
    void fetch("/api/ai/providers")
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as {
          providers?: Array<{ provider: string; label: string; configured: boolean }>;
        };
        const configured = (data.providers || []).filter((item) => item.configured);
        setProviderOptions(configured.map((item) => ({ value: item.provider, label: item.label })));
        if (configured[0]) setSelectedModel(configured[0].provider);
      })
      .catch(() => undefined);
  }, []);

  const folderSupported = useMemo(
    () => typeof window !== "undefined" && typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function",
    []
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function pushAi(text: string) {
    setMessages((previous) => [...previous, { id: nextId(), role: "ai", text }]);
  }

  function pushUser(text: string) {
    setMessages((previous) => [...previous, { id: nextId(), role: "user", text }]);
  }

  function historyPayload() {
    return messages
      .slice(-8)
      .map((item) => ({ role: item.role, text: item.text.slice(0, 400) }));
  }

  async function requestBuild(payload: Record<string, unknown>) {
    const response = await fetch("/api/ai/agent-build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        provider: selectedModel || undefined,
        history: historyPayload()
      })
    });
    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      kind?: AgentBuildKind;
      code?: string;
      refined?: boolean;
      redesigned?: boolean;
      error?: string;
    };
    if (!response.ok || !body.ok || !body.code || !body.kind) {
      throw new Error(body.error || "생성에 실패했습니다.");
    }
    return body as { kind: AgentBuildKind; code: string; refined?: boolean; redesigned?: boolean };
  }

  async function send(rawText?: string) {
    const text = (rawText ?? input).trim();
    if (!text || busy) return;
    setInput("");
    pushUser(text);
    setBusy(true);
    try {
      // 기존 결과물이 있고, 다른 종류를 새로 만들라는 명시가 없으면 수정으로 처리.
      const explicitKind = classifyAgentRequest(text);
      const wantsNew = /(새로|새\s|다시\s*처음|별도로|하나\s*더)/u.test(text);
      const refine = Boolean(
        artifact && !wantsNew && (!explicitKind || explicitKind === artifact.kind)
      );
      const result = await requestBuild(
        refine && artifact
          ? {
              message: text,
              refine: true,
              previousCode: artifact.code,
              previousKind: artifact.kind
            }
          : { message: text }
      );
      const label = AGENT_KIND_LABELS[result.kind];
      applyArtifact({
        kind: result.kind,
        code: result.code,
        fileName:
          result.refined && artifact ? artifact.fileName : AGENT_DEFAULT_FILENAMES[result.kind]
      });
      pushAi(
        result.refined
          ? "요청하신 수정을 반영했습니다. 오른쪽 미리보기에서 확인해 주세요. 마음에 들지 않으면 '되돌리기'로 이전 버전으로 복귀할 수 있어요."
          : `${label}을(를) 생성했습니다. 오른쪽 미리보기에서 확인하고, 고치고 싶은 부분을 채팅으로 말씀해 주세요.${directory ? " '폴더에 저장'을 누르면 연결된 폴더에 파일로 저장됩니다." : ""}`
      );
    } catch (caught) {
      pushAi(caught instanceof Error ? caught.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  // 기능은 유지한 채 완전히 다른 미학 방향으로 다시 디자인한다.
  async function redesign() {
    if (!artifact || busy) return;
    pushUser("완전히 다른 스타일로 다시 디자인해줘");
    setBusy(true);
    try {
      const result = await requestBuild({
        message: "",
        redesign: true,
        previousCode: artifact.code,
        previousKind: artifact.kind
      });
      applyArtifact({ kind: result.kind, code: result.code, fileName: artifact.fileName });
      pushAi("완전히 새로운 스타일로 다시 디자인했습니다. 이전이 낫다면 '되돌리기'를 누르세요.");
    } catch (caught) {
      pushAi(caught instanceof Error ? caught.message : "재디자인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function connectFolder() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      pushAi("이 브라우저는 폴더 연결을 지원하지 않습니다. Chrome 또는 Edge에서 사용해 주세요.");
      return;
    }
    try {
      const handle = await picker({ mode: "readwrite" });
      setDirectory(handle);
      setFolderFiles(null);
      pushAi(
        `'${handle.name}' 폴더를 연결했습니다. 생성물을 이 폴더에 저장하거나, '파일 열기'로 기존 파일을 불러와 수정할 수 있습니다.`
      );
    } catch {
      // 사용자가 선택을 취소한 경우 — 아무것도 하지 않는다.
    }
  }

  async function openFilePicker() {
    if (!directory) return;
    try {
      const names: string[] = [];
      for await (const entry of directory.values()) {
        if (entry.kind === "file" && EDITABLE_EXTENSIONS.test(entry.name)) names.push(entry.name);
        if (names.length >= 100) break;
      }
      names.sort((a, b) => a.localeCompare(b));
      setFolderFiles(names);
      if (!names.length) pushAi("폴더에 편집할 수 있는 파일(html·svg·코드·텍스트)이 없습니다.");
    } catch {
      pushAi("폴더 파일 목록을 읽지 못했습니다. 폴더를 다시 연결해 주세요.");
    }
  }

  async function loadFile(name: string) {
    if (!directory) return;
    setFolderFiles(null);
    try {
      const handle = await directory.getFileHandle(name);
      const file = await handle.getFile();
      if (file.size > MAX_LOAD_BYTES) {
        pushAi(`'${name}' 파일이 너무 큽니다(2MB 초과). 더 작은 파일을 선택해 주세요.`);
        return;
      }
      const code = await file.text();
      applyArtifact({ kind: kindFromFileName(name), code, fileName: name });
      pushAi(
        `'${name}' 파일을 불러왔습니다. 어떻게 수정할지 채팅으로 말씀해 주세요. 수정 후 '폴더에 저장'을 누르면 같은 파일에 덮어써집니다.`
      );
    } catch {
      pushAi(`'${name}' 파일을 읽지 못했습니다.`);
    }
  }

  async function saveToFolder() {
    if (!directory || !artifact || saving) return;
    setSaving(true);
    try {
      const handle = await directory.getFileHandle(artifact.fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(artifact.code);
      await writable.close();
      pushAi(`'${directory.name}/${artifact.fileName}'에 저장했습니다.`);
    } catch {
      pushAi("폴더에 저장하지 못했습니다. 폴더 쓰기 권한을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function download() {
    if (!artifact) return;
    const mime = artifact.kind === "image"
      ? "image/svg+xml;charset=utf-8"
      : artifact.fileName.endsWith(".html")
        ? "text/html;charset=utf-8"
        : "text/plain;charset=utf-8";
    const blob = new Blob([artifact.code], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // 결과물을 실제 브라우저 탭에서 전체 화면으로 확인한다.
  function openInNewTab() {
    if (!artifact) return;
    const mime = artifact.kind === "image"
      ? "image/svg+xml"
      : artifact.kind === "program"
        ? "text/plain;charset=utf-8"
        : "text/html;charset=utf-8";
    const blob = new Blob([artifact.code], { type: mime });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // SVG 이미지를 PNG로 변환해 내려받는다 (SVG를 못 받는 곳에 업로드할 때).
  async function downloadPng() {
    if (!artifact || artifact.kind !== "image" || !svgDataUrl) return;
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG load failed"));
        image.src = svgDataUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 1200;
      canvas.height = image.naturalHeight || 800;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.fileName.replace(/\.svg$/iu, ".png");
        anchor.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    } catch {
      pushAi("PNG 변환에 실패했습니다. SVG 다운로드를 이용해 주세요.");
    }
  }

  const svgDataUrl = useMemo(() => {
    if (!artifact || artifact.kind !== "image") return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(artifact.code)}`;
  }, [artifact]);

  const previewAsPage = artifact && (artifact.kind === "website" || artifact.kind === "app");

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)]">
      {/* 채팅 패널 */}
      <div className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col rounded-app border border-app-border bg-white shadow-soft">
        <div className="relative flex items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-hover text-app-primary">
              <Bot size={17} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-app-text">AI Agent</p>
              <p className="truncate text-[10.5px] text-app-muted">
                {directory ? `폴더: ${directory.name}` : "채팅으로 만들고, 폴더에 저장하세요"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {providerOptions.length > 1 ? (
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                title="생성에 사용할 AI 모델"
                aria-label="생성 모델"
                className="h-8 max-w-[110px] rounded-xl border border-app-border bg-white px-2 text-[11px] font-semibold text-app-muted outline-none"
              >
                {providerOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : null}
            {messages.length > 0 ? (
              <button
                type="button"
                aria-label="새 대화"
                title="새 대화 시작"
                onClick={resetChat}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-app-border text-app-muted transition hover:text-app-primary"
              >
                <RotateCcw size={12} />
              </button>
            ) : null}
            {directory ? (
              <>
                <button
                  type="button"
                  onClick={() => void openFilePicker()}
                  className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
                >
                  <FolderOpen size={12} />
                  파일 열기
                </button>
                <button
                  type="button"
                  aria-label="폴더 연결 해제"
                  title="폴더 연결 해제"
                  onClick={() => {
                    setDirectory(null);
                    setFolderFiles(null);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-app-border text-app-muted transition hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void connectFolder()}
                title={folderSupported ? "내 PC 폴더를 연결해 파일을 저장·수정합니다" : "Chrome/Edge에서 지원됩니다"}
                className="flex h-8 items-center gap-1 rounded-xl bg-app-primary px-2.5 text-[11px] font-bold text-white transition hover:opacity-90"
              >
                <FolderCheck size={12} />
                폴더 연결
              </button>
            )}
          </div>
          {folderFiles?.length ? (
            <div className="absolute right-3 top-14 z-30 max-h-64 w-64 overflow-y-auto rounded-app border border-app-border bg-white p-2 shadow-app app-scrollbar">
              <p className="px-2 py-1 text-[10px] font-bold text-app-muted">수정할 파일 선택</p>
              {folderFiles.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => void loadFile(name)}
                  className="block w-full truncate rounded-xl px-2 py-1.5 text-left text-[11px] font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
                >
                  {name}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 app-scrollbar">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white shadow-soft">
              <Sparkles size={13} />
            </span>
            <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md border border-app-border bg-white p-3.5 shadow-soft">
              <p className="text-sm font-bold text-app-text">무엇을 만들어드릴까요?</p>
              <p className="mt-1 text-[11px] leading-[18px] text-app-muted">
                "웹사이트 만들어줘", "로고 그려줘"처럼 채팅으로 말하면 종류를 알아서
                판단해 만들어 드립니다. 폴더를 연결하면 생성한 파일을 내 PC에 바로
                저장하고, 기존 파일을 불러와 수정할 수도 있어요.
              </p>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="grid gap-2 pl-10 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(prompt)}
                  className="rounded-2xl border border-app-border bg-white px-3 py-2.5 text-left text-[11px] font-semibold text-app-muted shadow-soft transition hover:border-app-primary/50 hover:text-app-primary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message) =>
            message.role === "ai" ? (
              <div key={message.id} className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white shadow-soft">
                  <Sparkles size={13} />
                </span>
                <div className="min-w-0 max-w-[88%] rounded-2xl rounded-tl-md border border-app-border bg-white p-3.5 shadow-soft">
                  <p className="whitespace-pre-line text-[12.5px] font-semibold leading-5 text-app-text">
                    {message.text}
                  </p>
                </div>
              </div>
            ) : (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-app-primary px-3.5 py-2.5 text-[12.5px] font-medium leading-5 text-white shadow-soft">
                  {message.text}
                </div>
              </div>
            )
          )}

          {busy ? (
            <div className="flex items-start gap-2 pl-10 text-[11px] font-semibold text-app-muted">
              <Loader2 size={13} className="mt-0.5 shrink-0 animate-spin text-app-primary" />
              <span>
                만드는 중입니다… 품질을 위해 초안 생성 후 디자인 다듬기까지 진행해요.
                <br />
                복잡한 요청은 2~3분 정도 걸릴 수 있습니다.
              </span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-app-border p-3.5">
          <div className="flex items-center gap-2 rounded-2xl border border-app-border bg-white px-3 py-2 shadow-soft">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void send();
              }}
              placeholder={artifact ? "수정할 내용이나 새 요청을 입력하세요…" : "예: 포트폴리오 웹사이트 만들어줘"}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
              aria-label="보내기"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white shadow-soft transition hover:opacity-90 disabled:opacity-40"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* 미리보기 패널 */}
      <section className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col rounded-app border border-app-border bg-white shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border px-4 py-3">
          <p className="flex min-w-0 items-center gap-2 text-xs font-bold text-app-text">
            미리보기
            {artifact ? (
              <span className="truncate rounded-lg bg-app-hover px-2 py-0.5 text-[10px] font-bold text-app-primary">
                {AGENT_KIND_LABELS[artifact.kind]} · {artifact.fileName}
              </span>
            ) : null}
          </p>
          {artifact ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {previewAsPage && !showCode ? (
                <div className="mr-1 inline-flex rounded-xl border border-app-border bg-white p-0.5">
                  {(
                    [
                      { id: "desktop", icon: Monitor, label: "데스크톱" },
                      { id: "tablet", icon: Tablet, label: "태블릿" },
                      { id: "mobile", icon: Smartphone, label: "모바일" }
                    ] as Array<{ id: typeof device; icon: typeof Monitor; label: string }>
                  ).map((option) => {
                    const Icon = option.icon;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-label={`${option.label} 미리보기`}
                        title={`${option.label} 화면으로 보기`}
                        onClick={() => setDevice(option.id)}
                        className={`flex h-7 w-8 items-center justify-center rounded-lg transition ${
                          device === option.id ? "bg-app-primary text-white" : "text-app-muted hover:text-app-primary"
                        }`}
                      >
                        <Icon size={12} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {versions.length > 0 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={undoArtifact}
                  title="직전 버전으로 되돌리기"
                  className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary disabled:opacity-50"
                >
                  <Undo2 size={12} />
                  되돌리기
                </button>
              ) : null}
              {previewAsPage ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void redesign()}
                  title="기능은 유지하고 완전히 다른 스타일로 재생성"
                  className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary disabled:opacity-50"
                >
                  <Wand2 size={12} />
                  다시 디자인
                </button>
              ) : null}
              <button
                type="button"
                onClick={openInNewTab}
                title="새 탭에서 전체 화면으로 열기"
                className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <ExternalLink size={12} />
                새 탭
              </button>
              <button
                type="button"
                onClick={() => setShowCode((value) => !value)}
                className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <Code2 size={12} />
                {showCode ? "미리보기" : "코드"}
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(artifact.code)}
                className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <Copy size={12} />
                복사
              </button>
              <button
                type="button"
                onClick={download}
                className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <Download size={12} />
                다운로드
              </button>
              {artifact.kind === "image" ? (
                <button
                  type="button"
                  onClick={() => void downloadPng()}
                  title="PNG 이미지로 변환해 다운로드"
                  className="flex h-8 items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
                >
                  <ImageDown size={12} />
                  PNG
                </button>
              ) : null}
              {directory ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveToFolder()}
                  className="flex h-8 items-center gap-1 rounded-xl bg-app-primary px-2.5 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <HardDriveDownload size={12} />}
                  폴더에 저장
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto app-scrollbar">
          {!artifact ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-app-hover text-app-primary">
                <Bot size={26} />
              </span>
              <p className="text-sm font-bold text-app-text">아직 생성된 결과물이 없습니다</p>
              <p className="max-w-sm text-xs leading-5 text-app-muted">
                왼쪽 채팅에 만들고 싶은 것을 설명해 보세요. 웹사이트와 앱은 이곳에서
                바로 실행되고, 이미지는 렌더링되어 표시됩니다.
              </p>
            </div>
          ) : showCode || artifact.kind === "program" ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-5 text-[11px] leading-5 text-slate-100">
              {artifact.code}
            </pre>
          ) : artifact.kind === "image" && svgDataUrl ? (
            <div className="flex h-full items-center justify-center bg-slate-50 p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgDataUrl}
                alt={artifact.fileName}
                className="max-h-full max-w-full rounded-2xl bg-white shadow-soft"
              />
            </div>
          ) : previewAsPage ? (
            <div className={`flex h-full justify-center ${device === "desktop" ? "" : "bg-slate-100 py-3"}`}>
              <iframe
                title="AI Agent 미리보기"
                sandbox="allow-scripts"
                srcDoc={artifact.code}
                style={device === "desktop" ? undefined : { width: device === "tablet" ? 768 : 390 }}
                className={`h-full border-0 bg-white ${
                  device === "desktop" ? "w-full" : "max-w-full rounded-2xl shadow-app"
                }`}
              />
            </div>
          ) : (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-5 text-[11px] leading-5 text-slate-100">
              {artifact.code}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
