"use client";

import {
  AlertTriangle,
  CalendarPlus,
  Code2,
  FolderPlus,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Mic,
  MessageSquareText,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  type LucideIcon
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConfidenceBadge } from "@/components/Chat/ConfidenceBadge";
import { SourceCard } from "@/components/Chat/SourceCard";
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { ConnectedContextWorkspace } from "@/components/context/ConnectedContextWorkspace";
import { createExecutionPreview } from "@/src/lib/agent/approval";
import { planAgentExecution } from "@/src/lib/agent/planner";
import type {
  AnswerConfidence,
  AnswerVerification,
  ChatMessageRecord,
  ChatSessionRecord,
  SourceDocument
} from "@/src/lib/chat/chat.types";
import {
  CHAT_QUICK_ACTIONS,
  type ChatQuickActionId
} from "@/src/lib/chat/chat-ui-actions";
import {
  CHAT_MODE_BEHAVIOR,
  shouldRouteToAgentPreview
} from "@/src/lib/chat/chat-mode-policy";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import type { WebSearchResult } from "@/src/lib/web-search/web-search.types";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceDocument[];
  confidence: AnswerConfidence | null;
  verification: AnswerVerification | null;
  pending?: boolean;
};

type ChatAction = {
  id: string;
  type: "todo" | "schedule";
  title: string;
  createdAt: string;
  done: boolean;
};

type ProjectRecord = {
  id: string;
  name: string;
  createdAt: string;
};

type ProjectSessionLink = {
  projectId: string;
  sessionId: string;
};

type IntegrationApp = {
  connectorId: string;
  commandPrefix: string;
};

type ChatMode = "ask" | "plan" | "agent";

type ChatModel = AIProviderName;

type CodeRunResult = {
  result: string | null;
  logs: string[];
  error?: string;
};

type SpeechRecognitionEventLike = {
  results?: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const ACTIONS_KEY = "dreamwish-chat-actions-v1";

const providerOptions: Array<{ value: ChatModel; label: string }> = [
  { value: "groq", label: "Groq" },
  { value: "gemini", label: "Gemini" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "huggingface", label: "HF" },
  { value: "cloudflare", label: "Cloudflare" }
];

const quickActionIcons: Record<ChatQuickActionId, LucideIcon> = {
  todo: Plus,
  schedule: CalendarPlus,
  web_search: Globe2,
  code_run: Code2,
  automation: Sparkles,
  approval_queue: AlertTriangle
};

export function ChatView() {
  const [sessions, setSessions] = useState<ChatSessionRecord[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actions, setActions] = useState<ChatAction[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [sessionLinks, setSessionLinks] = useState<ProjectSessionLink[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [integrationApps, setIntegrationApps] = useState<IntegrationApp[]>([]);
  const [providerStatus, setProviderStatus] = useState<Record<string, boolean>>({});
  const [chatMode, setChatMode] = useState<ChatMode>("ask");
  const [selectedModel, setSelectedModel] = useState<ChatModel>("groq");
  const [lastQuery, setLastQuery] = useState("");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadSessions();
    void loadProjects();
    void loadIntegrationApps();
    void loadProviderStatus();
    setActions(readLocalStorage<ChatAction[]>(ACTIONS_KEY, []));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACTIONS_KEY, JSON.stringify(actions));
  }, [actions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const currentProject = projects.find((project) => project.id === activeProjectId) || null;
  const contextQuery = input.trim() || lastQuery;
  const visibleSessions = sessions.filter((session) => {
    const link = sessionLinks.find((item) => item.sessionId === session.id);
    return activeProjectId ? link?.projectId === activeProjectId : !link;
  });

  async function loadSessions(selectFirst = false) {
    const response = await fetch("/api/ai/sessions");
    const data = (await response.json()) as { sessions: ChatSessionRecord[] };
    setSessions(data.sessions || []);

    if (selectFirst && data.sessions?.[0]) {
      await loadSession(data.sessions[0].id);
    }
  }

  async function loadSession(id: string) {
    const response = await fetch(`/api/ai/sessions/${id}`);
    if (!response.ok) return;

    const data = (await response.json()) as {
      session: ChatSessionRecord;
      messages: ChatMessageRecord[];
    };

    setCurrentSessionId(data.session.id);
    const lastUserMessage = [...data.messages]
      .reverse()
      .find((message) => message.role === "user");
    setLastQuery(lastUserMessage?.content || "");
    setMessages(
      data.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sources: message.sources_json || [],
        confidence: message.confidence_json,
        verification: message.verification_json
      }))
    );
  }

  async function loadProjects() {
    const [projectsResponse, linksResponse] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/projects/session-links")
    ]);
    const projectsData = (await projectsResponse.json()) as { projects?: ProjectRecord[] };
    const linksData = (await linksResponse.json()) as { sessionLinks?: ProjectSessionLink[] };
    setProjects(projectsData.projects || []);
    setSessionLinks(linksData.sessionLinks || []);
  }

  async function loadIntegrationApps() {
    const response = await fetch("/api/integrations/settings");
    const data = (await response.json()) as { enabledApps?: IntegrationApp[] };
    setIntegrationApps(data.enabledApps || []);
  }

  async function loadProviderStatus() {
    const response = await fetch("/api/integrations/status");
    if (!response.ok) return;
    const data = (await response.json()) as {
      ai?: { providers?: Array<{ provider: string; connected: boolean }> };
    };
    setProviderStatus(
      Object.fromEntries((data.ai?.providers || []).map((item) => [item.provider, item.connected]))
    );
  }

  function startNewChat() {
    setCurrentSessionId(undefined);
    setMessages([]);
    setInput("");
    setError(null);
    setLastQuery("");
  }

  async function deleteSession(sessionId: string) {
    await fetch(`/api/ai/sessions/${sessionId}?hard=true`, { method: "DELETE" });
    if (sessionId === currentSessionId) startNewChat();
    await loadSessions();
  }

  async function sendMessage() {
    const message = input.trim();
    if (!message || isLoading) return;

    const contextualQuery = currentProject ? `${currentProject.name} ${message}` : message;
    setLastQuery(contextualQuery);

    if (shouldRouteToAgentPreview(message, chatMode, integrationApps)) {
      await addAgentPreview(message, chatMode);
      return;
    }

    const webSearch = extractWebSearchQuery(message);
    if (webSearch) {
      await runWebSearch(webSearch, message);
      return;
    }

    const codeRun = parsePrefixedCommand(message, ["코드", "code", "js"]);
    if (codeRun) {
      await runCode(codeRun);
      return;
    }

    const localAction = parseLocalAction(message);
    if (localAction) {
      addChatAction(message, localAction);
      return;
    }

    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      sources: [],
      confidence: null,
      verification: null
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: UiMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      confidence: null,
      verification: null,
      pending: true
    };

    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message,
          useRag: true,
          model: selectedModel,
          projectId: activeProjectId
        })
      });

      if (!response.ok || !response.body) {
        throw new Error("AI 응답을 시작하지 못했습니다.");
      }

      await readEventStream(response, {
        onSession: (sessionId) => {
          setCurrentSessionId(sessionId);
          if (activeProjectId) void assignSessionToActiveProject(sessionId);
        },
        onSources: ({ sources, confidence }) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId ? { ...item, sources, confidence } : item
            )
          );
        },
        onDelta: (text) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? { ...item, content: `${item.content}${text}` }
                : item
            )
          );
        },
        onDone: ({ answer, sources, confidence, verification }) => {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: answer,
                    sources,
                    confidence,
                    verification,
                    pending: false
                  }
                : item
            )
          );
        },
        onError: (message) => {
          throw new Error(message);
        }
      });

      await loadSessions();
      await loadProjects();
    } catch (caught) {
      const message = stringifyUnknownError(caught);
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: message,
                pending: false,
                verification: {
                  supportedClaims: [],
                  weakClaims: [],
                  unsupportedClaims: [],
                  warning: message
                }
              }
            : item
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function assignSessionToActiveProject(sessionId: string) {
    if (!activeProjectId) return;
    await fetch("/api/projects/session-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: activeProjectId, sessionId })
    });
    await loadProjects();
  }

  function addChatAction(
    userContent: string,
    localAction: Pick<ChatAction, "type" | "title">
  ) {
    const action: ChatAction = {
      id: crypto.randomUUID(),
      type: localAction.type,
      title: localAction.title,
      createdAt: new Date().toISOString(),
      done: false
    };

    setActions((prev) => [action, ...prev]);
    setInput("");
    setError(null);
    addLocalExchange(
      userContent,
      action.type === "todo"
        ? `할 일을 만들었습니다.\n\n- ${action.title}`
        : `예약 항목을 만들었습니다.\n\n- ${action.title}`
    );
  }

  async function addAgentPreview(userContent: string, mode: ChatMode = chatMode) {
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const plan = await planAgentExecution(userContent);
      const preview = createExecutionPreview(plan);
      const behavior = CHAT_MODE_BEHAVIOR[mode];
      addLocalExchange(
        userContent,
        [
          behavior.title,
          "",
          behavior.description,
          "",
          `목표: ${preview.goal}`,
          `위험도: ${preview.risk}`,
          preview.summary,
          "",
          ...preview.steps.map(
            (step) =>
              `${step.order}. ${step.title}\n   ${step.description}${
                step.requiresApproval ? "\n   승인 필요" : ""
              }`
          ),
          "",
          mode === "plan"
            ? "계획 모드에서는 실행하지 않고 다음 단계만 정리합니다."
            : "승인 전에는 CRM, Knowledge, Automation, 파일을 수정하지 않습니다."
        ].join("\n")
      );
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  function addLocalExchange(userContent: string, assistantContent: string) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: userContent,
        sources: [],
        confidence: null,
        verification: null
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: assistantContent,
        sources: [],
        confidence: null,
        verification: null
      }
    ]);
  }

  async function runWebSearch(query: string, originalMessage = `웹 검색: ${query}`) {
    setInput("");
    setError(null);
    setIsLoading(true);
    setLastQuery(query);

    try {
      const response = await fetch("/api/tools/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = (await response.json()) as {
        results?: WebSearchResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "웹 검색에 실패했습니다.");

      const lines = (data.results || [])
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\n${result.snippet}\n${result.url}`
        )
        .join("\n\n");
      addLocalExchange(originalMessage, lines || "웹 검색 결과가 없습니다.");
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function runCode(code: string) {
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/tools/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code })
      });
      const data = (await response.json()) as CodeRunResult;
      if (!response.ok) throw new Error(data.error || "코드 실행에 실패했습니다.");

      addLocalExchange(
        `코드:\n${code}`,
        [
          "실행 결과",
          data.result !== null ? String(data.result) : "(반환값 없음)",
          data.logs?.length ? "\n로그\n" + data.logs.join("\n") : ""
        ]
          .filter(Boolean)
          .join("\n")
      );
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setIsLoading(false);
    }
  }

  async function attachFile(file: File) {
    setAttachmentMenuOpen(false);
    const textPreview = await readAttachmentPreview(file);
    await saveAttachedFile(file, textPreview);
    const textLike =
      file.type.startsWith("text/") ||
      /\.(md|txt|json|csv|tsv|js|ts|tsx|css|html|xml|yaml|yml)$/iu.test(file.name);

    if (!textLike) {
      addLocalExchange(
        `파일 첨부: ${file.name}`,
        `파일을 첨부했습니다.\n\n이름: ${file.name}\n형식: ${
          file.type || "알 수 없음"
        }\n크기: ${formatBytes(file.size)}`
      );
      return;
    }

    setInput((prev) =>
      `${prev}${prev ? "\n\n" : ""}첨부 파일: ${file.name}\n\n${textPreview.slice(0, 8000)}`
    );
  }

  async function analyzeImage(file: File) {
    setAttachmentMenuOpen(false);
    await saveAttachedFile(file, "");
    try {
      const bitmap = await createImageBitmap(file);
      const color = averageImageColor(bitmap);
      addLocalExchange(
        `이미지 첨부: ${file.name}`,
        [
          "이미지를 첨부했습니다.",
          `- 파일명: ${file.name}`,
          `- 크기: ${formatBytes(file.size)}`,
          `- 해상도: ${bitmap.width} x ${bitmap.height}`,
          `- 형식: ${file.type || "알 수 없음"}`,
          `- 평균 색상: ${color}`
        ].join("\n")
      );
      bitmap.close();
    } catch {
      setError("이미지를 분석하지 못했습니다.");
    }
  }

  async function saveAttachedFile(file: File, textPreview: string) {
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        source: "aichat",
        textPreview,
        projectId: activeProjectId
      })
    });
  }

  function startVoiceInput() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("이 브라우저는 음성 입력을 지원하지 않습니다.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInput((prev) => `${prev}${prev ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => setError("음성 입력을 완료하지 못했습니다.");
    recognition.start();
  }

  function createProjectFromConversation() {
    setProjectModalOpen(true);
  }

  async function saveProject() {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName })
    });
    const data = (await response.json()) as { project?: ProjectRecord };
    if (data.project) {
      setProjectName("");
      setProjectModalOpen(false);
      setActiveProjectId(data.project.id);
      startNewChat();
      await loadProjects();
    }
  }

  return (
    <div className="grid h-[calc(100vh-96px)] min-h-[720px] grid-cols-[clamp(240px,16vw,260px)_minmax(620px,760px)_minmax(0,1fr)] gap-5">
      <SurfaceCard className="flex min-h-0 flex-col p-4">
        <SectionHeader
          icon={MessageSquareText}
          title="대화 목록"
        />

        <div className="mb-3 space-y-2 rounded-app border border-app-border bg-app-bg p-3">
          <button
            type="button"
            onClick={() => {
              setActiveProjectId(null);
              startNewChat();
            }}
            className={`w-full rounded-2xl px-3 py-2 text-left text-xs font-semibold ${
              activeProjectId === null ? "bg-white text-app-primary" : "text-app-muted"
            }`}
          >
            프로젝트 없음
          </button>
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                setActiveProjectId(project.id);
                startNewChat();
              }}
              className={`w-full truncate rounded-2xl px-3 py-2 text-left text-xs font-semibold ${
                activeProjectId === project.id ? "bg-white text-app-primary" : "text-app-muted"
              }`}
            >
              {project.name}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1 app-scrollbar">
          {visibleSessions.length === 0 ? (
            <EmptyState
              compact
              icon={MessageSquareText}
              title="대화 없음"
              description="질문을 입력하면 로컬 대화가 저장됩니다."
            />
          ) : (
            visibleSessions.map((session) => (
              <div
                key={session.id}
                className={`group flex items-start gap-2 rounded-2xl border px-3 py-3 transition ${
                  currentSessionId === session.id
                    ? "border-app-primary bg-app-hover"
                    : "border-app-border bg-white hover:bg-app-hover"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void loadSession(session.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-sm font-semibold text-app-text">
                    {session.title}
                  </p>
                  <p className="mt-1 text-xs text-app-muted">
                    {new Date(session.updated_at).toLocaleString("ko-KR")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSession(session.id)}
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-400 opacity-0 transition hover:bg-white hover:text-red-500 group-hover:opacity-100"
                  aria-label="대화 삭제"
                  title="대화 삭제"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={createProjectFromConversation}
            className="flex w-full items-center justify-center gap-2 rounded-app border border-app-border bg-white px-3 py-3 text-xs font-semibold text-app-text shadow-soft transition hover:bg-app-hover hover:text-app-primary"
          >
            <FolderPlus size={14} />
            프로젝트 만들기
          </button>

          <div className="rounded-app border border-app-border bg-app-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-app-text">채팅 액션</p>
              <span className="text-xs font-medium text-app-muted">{actions.length}</span>
            </div>
            {actions.length === 0 ? (
              <p className="text-xs leading-5 text-app-muted">할 일과 예약 항목이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {actions.slice(0, 3).map((action) => (
                  <label key={action.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={action.done}
                      onChange={(event) =>
                        setActions((prev) =>
                          prev.map((item) =>
                            item.id === action.id
                              ? { ...item, done: event.target.checked }
                              : item
                          )
                        )
                      }
                      className="mt-0.5 accent-app-primary"
                    />
                    <span className="min-w-0">
                      <span className="font-semibold text-app-text">
                        {action.type === "todo" ? "할 일" : "예약"}
                      </span>
                      <span className="block truncate text-app-muted">{action.title}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-app border border-app-border bg-app-bg p-3">
            <p className="mb-2 text-xs font-semibold text-app-text">프로젝트</p>
            {projects.length === 0 ? (
              <p className="text-xs leading-5 text-app-muted">
                대화 목록에서 만든 프로젝트가 여기에 표시됩니다.
              </p>
            ) : (
              <div className="space-y-2">
                {projects.slice(0, 3).map((project) => (
                  <p key={project.id} className="truncate text-xs font-medium text-app-text">
                    {project.name}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </SurfaceCard>

      <SurfaceCard className="flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-app-border p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-app-text">AI Chat</h1>
              <p className="mt-1 text-sm text-app-muted">
                {currentProject ? `${currentProject.name} 프로젝트에 채팅이 저장됩니다.` : "프로젝트 없이 채팅합니다."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-2xl border border-app-border bg-white p-1">
                {(["ask", "plan", "agent"] as ChatMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setChatMode(mode)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                      chatMode === mode ? "bg-app-primary text-white" : "text-app-muted"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as ChatModel)}
                className="h-9 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text outline-none"
                title="AI 모델 선택"
              >
                {providerOptions.map((provider) => (
                  <option key={provider.value} value={provider.value}>
                    {provider.label}
                    {provider.value in providerStatus
                      ? providerStatus[provider.value]
                        ? " connected"
                        : " (key missing)"
                      : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-6 app-scrollbar">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="max-w-[460px] text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-app-hover text-app-primary">
                  <Sparkles size={24} />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-app-text">
                  DREAMWISH Command Center
                </h2>
                <p className="mt-2 text-sm leading-6 text-app-muted">
                  질문, 웹 검색, 파일 첨부, 코드 실행, CRM/Automation 실행 계획을 한 곳에서 시작하세요.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-[22px] px-5 py-4 shadow-soft ${
                      message.role === "user"
                        ? "bg-app-primary text-white"
                        : "border border-app-border bg-white text-app-text"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-6">
                      {message.content || (
                        <span className="inline-flex items-center gap-2 text-app-muted">
                          <Loader2 size={15} className="animate-spin" />
                          응답 생성 중
                        </span>
                      )}
                    </div>

                    {message.role === "assistant" ? (
                      <div className="mt-4 space-y-3">
                        <ConfidenceBadge confidence={message.confidence} />
                        {message.verification?.warning ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>{message.verification.warning}</span>
                          </div>
                        ) : null}
                        {message.sources.length > 0 ? (
                          <div className="grid gap-3">
                            {message.sources.map((source) => (
                              <SourceCard key={source.path} source={source} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {error ? (
          <div className="border-t border-app-border px-5 py-3">
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          </div>
        ) : null}

        <div className="border-t border-app-border p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {CHAT_QUICK_ACTIONS.map((action) => {
              const Icon = quickActionIcons[action.id];
              return (
                <ToolButton key={action.id} onClick={() => setInput(action.prompt)}>
                  <Icon size={13} />
                  {action.label}
                </ToolButton>
              );
            })}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void attachFile(file);
              event.currentTarget.value = "";
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void analyzeImage(file);
              event.currentTarget.value = "";
            }}
          />

          <div className="relative flex min-h-[58px] items-end gap-2 rounded-app border border-app-border bg-app-bg px-3 py-3">
            <button
              type="button"
              onClick={() => {
                void loadIntegrationApps();
                setAttachmentMenuOpen((open) => !open);
              }}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-white text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              aria-label="첨부 메뉴"
              title="첨부"
            >
              <Plus size={17} />
            </button>

            {attachmentMenuOpen ? (
              <div className="absolute bottom-[62px] left-3 z-10 w-44 rounded-app border border-app-border bg-white p-2 shadow-app">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:bg-app-hover"
                >
                  <Paperclip size={14} />
                  파일 첨부
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:bg-app-hover"
                >
                  <ImageIcon size={14} />
                  이미지 첨부
                </button>
                {integrationApps.length > 0 ? (
                  <div className="my-2 border-t border-app-border" />
                ) : null}
                {integrationApps.map((app) => (
                  <button
                    key={app.connectorId}
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      setInput(`${app.commandPrefix}: `);
                    }}
                    className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:bg-app-hover"
                  >
                    <Globe2 size={14} />
                    {app.commandPrefix}
                  </button>
                ))}
              </div>
            ) : null}

            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent text-sm leading-6 text-app-text outline-none placeholder:text-slate-400"
              placeholder="질문하거나 '웹 검색:', '코드:', '할 일:', '고객 만들어'처럼 입력하세요."
            />
            <button
              type="button"
              onClick={startVoiceInput}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-white text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              aria-label="음성 입력"
              title="음성 입력"
            >
              <Mic size={16} />
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={isLoading || input.trim().length === 0}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-primary text-white transition hover:brightness-105 disabled:bg-slate-200 disabled:text-slate-400"
              aria-label="전송"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </SurfaceCard>

      <ConnectedContextWorkspace query={contextQuery} />
      {projectModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-[420px] rounded-app border border-app-border bg-white p-5 shadow-app">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-app-text">프로젝트 만들기</h2>
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted"
              >
                닫기
              </button>
            </div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary"
              placeholder="프로젝트 이름"
            />
            <button
              type="button"
              onClick={() => void saveProject()}
              className="mt-3 h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white"
            >
              저장
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  onClick,
  children
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
    >
      {children}
    </button>
  );
}

function parsePrefixedCommand(message: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp(`^${escaped}\\s*[:：\\-]?\\s*([\\s\\S]+)$`, "iu"));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

function extractWebSearchQuery(message: string) {
  const prefixed = parsePrefixedCommand(message, ["웹 검색", "웹검색", "web search", "web"]);
  if (prefixed) return prefixed;

  if (/(찾아줘|검색해줘|검색해|조사해줘|알아봐|웹에서)/iu.test(message)) {
    return message.replace(/(찾아줘|검색해줘|검색해|조사해줘|알아봐|웹에서)/giu, "").trim() || message;
  }

  return null;
}

function parseLocalAction(message: string): Pick<ChatAction, "type" | "title"> | null {
  const todo = message.match(/^(할 일|할일|todo|to do)\s*[:：\-]?\s*(.+)$/iu);
  if (todo?.[2]?.trim()) {
    return { type: "todo", title: todo[2].trim() };
  }

  const schedule = message.match(/^(예약|일정|schedule)\s*[:：\-]?\s*(.+)$/iu);
  if (schedule?.[2]?.trim()) {
    return { type: "schedule", title: schedule[2].trim() };
  }

  return null;
}

async function readEventStream(
  response: Response,
  handlers: {
    onSession: (sessionId: string) => void;
    onSources: (data: {
      sources: SourceDocument[];
      confidence: AnswerConfidence;
    }) => void;
    onDelta: (text: string) => void;
    onDone: (data: {
      answer: string;
      sources: SourceDocument[];
      confidence: AnswerConfidence;
      verification: AnswerVerification;
      sessionId: string;
    }) => void;
    onError: (message: string) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming 응답을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const eventText of events) {
      handleSseEvent(eventText, handlers);
    }
  }

  if (buffer.trim()) {
    handleSseEvent(buffer, handlers);
  }
}

function handleSseEvent(
  eventText: string,
  handlers: Parameters<typeof readEventStream>[1]
) {
  const event = eventText.match(/^event:\s*(.+)$/m)?.[1]?.trim();
  const dataRaw = eventText
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();
  if (!event || !dataRaw) return;

  let data: {
    sessionId?: string;
    sources?: SourceDocument[];
    confidence?: AnswerConfidence;
    text?: string;
    answer?: string;
    verification?: AnswerVerification;
    error?: string;
  };

  try {
    data = JSON.parse(dataRaw) as typeof data;
  } catch {
    handlers.onError("Streaming 이벤트를 읽지 못했습니다.");
    return;
  }

  if (event === "session" && data.sessionId) handlers.onSession(data.sessionId);
  if (event === "sources" && data.sources && data.confidence) {
    handlers.onSources({ sources: data.sources, confidence: data.confidence });
  }
  if (event === "delta") handlers.onDelta(data.text || "");
  if (
    event === "done" &&
    data.answer &&
    data.sources &&
    data.confidence &&
    data.verification &&
    data.sessionId
  ) {
    handlers.onDone({
      answer: data.answer,
      sources: data.sources,
      confidence: data.confidence,
      verification: data.verification,
      sessionId: data.sessionId
    });
  }
  if (event === "error") handlers.onError(data.error || "Streaming 중단");
}

function averageImageColor(bitmap: ImageBitmap) {
  const canvas = document.createElement("canvas");
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "#000000";

  context.drawImage(bitmap, 0, 0, size, size);
  const data = context.getImageData(0, 0, size, size).data;
  let red = 0;
  let green = 0;
  let blue = 0;

  for (let index = 0; index < data.length; index += 4) {
    red += data[index];
    green += data[index + 1];
    blue += data[index + 2];
  }

  const count = data.length / 4;
  return rgbToHex(
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count)
  );
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${[red, green, blue]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

async function readAttachmentPreview(file: File) {
  const textLike =
    file.type.startsWith("text/") ||
    /\.(md|txt|json|csv|tsv|js|ts|tsx|css|html|xml|yaml|yml)$/iu.test(file.name);
  return textLike ? (await file.text()).slice(0, 12000) : "";
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
