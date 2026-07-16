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
import { EmptyState } from "@/components/Common/EmptyState";
import { SectionHeader } from "@/components/Common/SectionHeader";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { DeepResearchDock } from "@/components/Chat/DeepResearchPanel";
import { ResearchWorkspace } from "@/components/Chat/ResearchWorkspace";
import {
  MemoryCandidateCard,
  type MemoryCandidateCardData
} from "@/components/Memory/MemoryCandidateCard";
import { getErrorCode, readApiResponse } from "@/src/lib/api/api-response";
import type {
  AnswerConfidence,
  AnswerVerification,
  ChatMessageRecord,
  ChatSessionRecord,
  SourceDocument
} from "@/src/lib/chat/chat.types";
import {
  getChatErrorCode,
  getLocalizedChatError,
  shouldSubmitChat,
  type ChatStatus
} from "@/src/lib/chat/chat-flow";
import { upsertOptimisticChatSession } from "@/src/lib/chat/session-list";
import {
  CHAT_QUICK_ACTIONS,
  type ChatQuickActionId
} from "@/src/lib/chat/chat-ui-actions";
import { shouldRouteToAgentPreview } from "@/src/lib/chat/chat-mode-policy";
import { stringifyUnknownError } from "@/src/lib/auth/access-control";
import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import {
  getChatQuickActionText
} from "@/src/lib/i18n/translations";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { normalizeChatAnswer } from "@/src/lib/chat/chat-answer-display";

type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceDocument[];
  confidence: AnswerConfidence | null;
  verification: AnswerVerification | null;
  pending?: boolean;
  memoryStatus?: string;
  memoryCandidates?: MemoryCandidateCardData[];
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
  results?: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & {
  isFinal?: boolean;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous?: boolean;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const ACTIONS_KEY = "dreamwish-chat-actions-v1";

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
  const [providerOptions, setProviderOptions] = useState<Array<{ value: ChatModel; label: string }>>([]);
  const [chatMode, setChatMode] = useState<ChatMode>("ask");
  const [selectedModel, setSelectedModel] = useState<ChatModel>("groq");
  const [lastQuery, setLastQuery] = useState("");
  const [chatStatus, setChatStatus] = useState<ChatStatus>("idle");
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [memoryMutatingId, setMemoryMutatingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const { language, t } = useAppLanguage();

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
  const fileLabels = chatFileLabels(language);
  const contextQuery = lastQuery.trim();
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
    try {
      const [projectsResponse, linksResponse] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/projects/session-links")
      ]);
      const [projectsData, linksData] = await Promise.all([
        readApiResponse<{ projects?: ProjectRecord[] }>(projectsResponse),
        readApiResponse<{ sessionLinks?: ProjectSessionLink[] }>(linksResponse)
      ]);
      setProjects(projectsData.projects || []);
      setSessionLinks(linksData.sessionLinks || []);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    }
  }

  async function loadIntegrationApps() {
    const response = await fetch("/api/integrations/settings");
    const data = (await response.json()) as { enabledApps?: IntegrationApp[] };
    setIntegrationApps(data.enabledApps || []);
  }

  async function loadProviderStatus() {
    const response = await fetch("/api/ai/providers");
    if (!response.ok) return;
    const data = (await response.json()) as {
      providers?: Array<{ provider: ChatModel; label: string; configured: boolean }>;
    };
    const configured = (data.providers || []).filter((item) => item.configured);
    setProviderOptions(configured.map((item) => ({ value: item.provider, label: item.label })));
    setProviderStatus(
      Object.fromEntries((data.providers || []).map((item) => [item.provider, item.configured]))
    );
    const firstConnected = configured[0];
    if (firstConnected) setSelectedModel(firstConnected.provider);
  }

  function startNewChat() {
    setCurrentSessionId(undefined);
    setMessages([]);
    setInput("");
    setError(null);
    setLastQuery("");
  }

  async function deleteSession(sessionId: string) {
    await fetch(`/api/ai/sessions/${sessionId}`, { method: "DELETE" });
    if (sessionId === currentSessionId) startNewChat();
    await loadSessions();
  }

  async function approveChatMemoryCandidate(
    messageId: string,
    candidate: MemoryCandidateCardData,
    content: string
  ) {
    setMemoryMutatingId(candidate.id);
    try {
      const response = await fetch(`/api/memory/candidates/${candidate.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: candidate.version,
          content,
          note: "Approved from AI Chat"
        })
      });
      if (!response.ok) await readApiResponse<unknown>(response);
      removeChatMemoryCandidate(messageId, candidate.id);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setMemoryMutatingId(null);
    }
  }

  async function rejectChatMemoryCandidate(messageId: string, candidate: MemoryCandidateCardData) {
    setMemoryMutatingId(candidate.id);
    try {
      const response = await fetch(`/api/memory/candidates/${candidate.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: candidate.version })
      });
      if (!response.ok) await readApiResponse<unknown>(response);
      removeChatMemoryCandidate(messageId, candidate.id);
    } catch (caught) {
      setError(stringifyUnknownError(caught));
    } finally {
      setMemoryMutatingId(null);
    }
  }

  function removeChatMemoryCandidate(messageId: string, candidateId: string) {
    setMessages((previous) => previous.map((message) =>
      message.id === messageId
        ? {
            ...message,
            memoryCandidates: (message.memoryCandidates || []).filter(
              (candidate) => candidate.id !== candidateId
            )
          }
        : message
    ));
  }

  async function sendMessage() {
    if (!shouldSubmitChat(input, isLoading, false)) {
      if (!input.trim()) {
        setError(getLocalizedChatError("MESSAGE_REQUIRED", language));
      }
      return;
    }

    const message = input.trim();

    if (isAutomationCreationCommand(message)) {
      await createAutomationFromChat(message);
      return;
    }

    const contextualQuery = currentProject ? `${currentProject.name} ${message}` : message;
    setLastQuery(contextualQuery);

    const effectiveMode: ChatMode = shouldRouteToAgentPreview(
      message,
      chatMode,
      integrationApps
    )
      ? chatMode === "plan"
        ? "plan"
        : "agent"
      : "ask";

    if (effectiveMode === "ask") {
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
    setChatStatus("submitting");
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const response = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId,
          message,
          model: selectedModel,
          projectId: activeProjectId,
          mode: effectiveMode
        })
      });

      if (!response.ok || !response.body) {
        await readApiResponse<unknown>(response);
        throw Object.assign(new Error(t("chat.answerFailed")), { code: "GENERATION_FAILED" });
      }

      await readEventStream(response, {
        onStatus: (status) => {
          setChatStatus(status);
        },
        onSession: (sessionId) => {
          setCurrentSessionId(sessionId);
          if (activeProjectId) void assignSessionToActiveProject(sessionId);
        },
        onSessionRecord: (session) => {
          setSessions((prev) => upsertOptimisticChatSession(prev, session));
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
        onDone: ({ answer, sources, confidence, verification, memoryStatus, memoryCandidates }) => {
          setChatStatus("completed");
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: answer,
                    sources,
                    confidence,
                    verification,
                    memoryStatus,
                    memoryCandidates,
                    pending: false
                  }
                : item
            )
          );
        },
        onError: (message, code) => {
          throw Object.assign(new Error(message), { code: code || "GENERATION_FAILED" });
        }
      });

      await loadSessions();
      await loadProjects();
    } catch (caught) {
      setChatStatus(getChatErrorCode(caught) === "REQUEST_CANCELLED" ? "cancelled" : "error");
      const message = getLocalizedChatError(getErrorCode(caught) || "GENERATION_FAILED", language);
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

  async function createAutomationFromChat(message: string) {
    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      sources: [],
      confidence: null,
      verification: null
    };
    const assistantId = crypto.randomUUID();
    setInput("");
    setError(null);
    setIsLoading(true);
    setMessages((previous) => [
      ...previous,
      userMessage,
      {
        id: assistantId,
        role: "assistant",
        content: "자동화 시나리오를 구성하고 있습니다.",
        sources: [],
        confidence: null,
        verification: null,
        pending: true
      }
    ]);
    try {
      const response = await fetch("/api/automation/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message })
      });
      const data = (await response.json().catch(() => ({}))) as {
        scenario?: { id: string; name: string; nodes: unknown[] };
        error?: string;
      };
      if (!response.ok || !data.scenario) {
        throw new Error(data.error || "자동화 시나리오를 만들지 못했습니다.");
      }
      setMessages((previous) => previous.map((item) => item.id === assistantId
        ? {
            ...item,
            content: `${data.scenario!.name} 자동화 초안을 만들었습니다. ${data.scenario!.nodes.length}개 모듈을 자동화 페이지에서 연결·수정하고 실행할 수 있습니다.`,
            pending: false
          }
        : item));
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("dreamwish:navigate", {
          detail: { view: "automation", scenarioId: data.scenario!.id }
        }));
      }, 900);
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : "자동화 시나리오를 만들지 못했습니다.";
      setMessages((previous) => previous.map((item) => item.id === assistantId
        ? { ...item, content: messageText, pending: false }
        : item));
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
        ? `${t("chat.actions.todoCreated")}\n\n- ${action.title}`
        : `${t("chat.actions.scheduleCreated")}\n\n- ${action.title}`
    );
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
      if (!response.ok) throw new Error(data.error || t("chat.codeFailed"));

      addLocalExchange(
        `코드:\n${code}`,
        [
          t("chat.runResult"),
          data.result !== null ? String(data.result) : `(${t("chat.noReturnValue")})`,
          data.logs?.length ? `\n${t("chat.logs")}\n` + data.logs.join("\n") : ""
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
      setInput((prev) =>
        [
          prev,
          `${fileLabels.fileAttached}: ${file.name}`,
          `${fileLabels.type}: ${file.type || fileLabels.unknown}`,
          `${fileLabels.size}: ${formatBytes(file.size)}`,
          "이 첨부 파일의 메타데이터를 바탕으로 분석하고, 추가로 필요한 정보가 있으면 물어봐."
        ]
          .filter(Boolean)
          .join("\n\n")
      );
      return;
    }

    setInput((prev) =>
      `${prev}${prev ? "\n\n" : ""}${fileLabels.attachedFile}: ${file.name}\n\n${textPreview.slice(0, 8000)}`
    );
  }

  async function analyzeImage(file: File) {
    setAttachmentMenuOpen(false);
    await saveAttachedFile(file, "");
    try {
      const bitmap = await createImageBitmap(file);
      const color = averageImageColor(bitmap);
      setInput((prev) =>
        [
          prev,
          t("chat.imageAttached"),
          `- ${fileLabels.fileName}: ${file.name}`,
          `- ${fileLabels.size}: ${formatBytes(file.size)}`,
          `- ${fileLabels.resolution}: ${bitmap.width} x ${bitmap.height}`,
          `- ${fileLabels.type}: ${file.type || fileLabels.unknown}`,
          `- ${fileLabels.averageColor}: ${color}`,
          "",
          "이 이미지의 파일명, 크기, 해상도, 색상 정보를 바탕으로 분석해줘. 이미지 내용 식별에 한계가 있으면 명확히 말해줘."
        ]
          .filter(Boolean)
          .join("\n")
      );
      bitmap.close();
    } catch {
      setError(fileLabels.imageFailed);
    }
  }

  async function saveAttachedFile(file: File, textPreview: string) {
    const form = new FormData();
    form.set("file", file);
    form.set("source", "aichat");
    form.set("textPreview", textPreview);
    if (activeProjectId) form.set("projectId", activeProjectId);
    const response = await fetch("/api/files", { method: "POST", body: form });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error || "첨부 파일을 저장하지 못했습니다.");
    }
    window.dispatchEvent(new Event("dreamwish:storage-updated"));
  }

  function startVoiceInput() {
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError(t("chat.browserVoiceUnsupported"));
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .filter((result) => result.isFinal !== false)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
      if (transcript) setInput((prev) => `${prev}${prev ? " " : ""}${transcript}`);
    };
    recognition.onerror = (event) => {
      setError(event.error === "not-allowed" ? "Microphone permission was denied." : t("chat.voiceFailed"));
    };
    try {
      recognition.start();
    } catch {
      setError(t("chat.voiceFailed"));
    }
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
          title={t("chat.sessions")}
        />

        <button
          type="button"
          onClick={startNewChat}
          disabled={isLoading}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-app bg-app-primary px-3 py-2.5 text-xs font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          <Plus size={14} />
          새 채팅
        </button>

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
            {t("chat.noProject")}
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
              title={t("chat.noSessionsTitle")}
              description={t("chat.noSessionsDescription")}
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
                    {new Date(session.updated_at).toLocaleString(
                      language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "ko-KR"
                    )}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSession(session.id)}
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-slate-400 opacity-0 transition hover:bg-white hover:text-red-500 group-hover:opacity-100"
                  aria-label={t("common.delete")}
                  title={t("common.delete")}
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
            {t("chat.createProject")}
          </button>

          <div className="rounded-app border border-app-border bg-app-bg p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-app-text">{t("chat.actions.title")}</p>
              <span className="text-xs font-medium text-app-muted">{actions.length}</span>
            </div>
            {actions.length === 0 ? (
              <p className="text-xs leading-5 text-app-muted">{t("chat.actions.empty")}</p>
            ) : (
              <div className="space-y-2">
                {actions.slice(0, 3).map((action) => (
                  <div key={action.id} className="flex items-start gap-2 text-xs">
                    <label className="flex min-w-0 flex-1 items-start gap-2">
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
                          {action.type === "todo" ? t("chat.actions.todo") : t("chat.actions.schedule")}
                        </span>
                        <span className="block truncate text-app-muted">{action.title}</span>
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setActions((prev) => prev.filter((item) => item.id !== action.id))}
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white hover:text-red-500"
                      aria-label={t("chat.actions.delete")}
                      title={t("chat.actions.delete")}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-app border border-app-border bg-app-bg p-3">
            <p className="mb-2 text-xs font-semibold text-app-text">{t("chat.project")}</p>
            {projects.length === 0 ? (
              <p className="text-xs leading-5 text-app-muted">
                {t("chat.noProjectItems")}
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
              <h1 className="text-lg font-semibold text-app-text">{t("chat.title")}</h1>
              <p className="mt-1 text-sm text-app-muted">
                {currentProject
                  ? t("chat.subtitleProject", { project: currentProject.name })
                  : t("chat.subtitleNoProject")}
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
                    {t(`chat.mode.${mode}`)}
                  </button>
                ))}
              </div>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value as ChatModel)}
                className="h-9 rounded-2xl border border-app-border bg-white px-3 text-xs font-semibold text-app-text outline-none"
                title={t("chat.modelTitle")}
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
            <div className="h-full" aria-label="empty conversation" />
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
                    <div className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                      {normalizeChatAnswer(message.content) || (
                        <span className="inline-flex items-center gap-2 text-app-muted">
                          <Loader2 size={15} className="animate-spin" />
                          {t("chat.generating")}
                        </span>
                      )}
                    </div>

                    {message.role === "assistant" ? (
                      <div className="mt-4 space-y-3">
                        {message.verification?.warning ? (
                          <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                            <span>{message.verification.warning}</span>
                          </div>
                        ) : null}
                        {message.memoryCandidates?.length ? (
                          <div className="grid gap-3">
                            {message.memoryCandidates.map((candidate) => (
                              <MemoryCandidateCard
                                key={candidate.id}
                                candidate={candidate}
                                language={language}
                                busy={memoryMutatingId === candidate.id}
                                onApprove={(content) => void approveChatMemoryCandidate(message.id, candidate, content)}
                                onReject={() => void rejectChatMemoryCandidate(message.id, candidate)}
                                onDefer={() => removeChatMemoryCandidate(message.id, candidate.id)}
                              />
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
              const text = getChatQuickActionText(action.id, language);
              return (
                <ToolButton
                  key={action.id}
                  onClick={() => {
                    setChatMode(modeForQuickAction(action.id));
                    setInput(text.prompt);
                  }}
                >
                  <Icon size={13} />
                  {text.label}
                </ToolButton>
              );
            })}
          </div>

          <DeepResearchDock currentQuery={input} sessionId={currentSessionId} />

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
              aria-label={t("chat.attachmentMenu")}
              title={t("chat.attach")}
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
                  {t("chat.attachFile")}
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:bg-app-hover"
                >
                  <ImageIcon size={14} />
                  {t("chat.attachImage")}
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
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              rows={1}
              className="max-h-32 min-h-8 flex-1 resize-none bg-transparent text-sm leading-6 text-app-text outline-none placeholder:text-slate-400"
              placeholder={t("chat.inputPlaceholder")}
            />
            <button
              type="button"
              onClick={startVoiceInput}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-white text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              aria-label={t("chat.voice")}
              title={t("chat.voice")}
            >
              <Mic size={16} />
            </button>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={!shouldSubmitChat(input, isLoading, false)}
              className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-primary text-white transition hover:brightness-105 disabled:bg-slate-200 disabled:text-slate-400"
              aria-label={t("chat.send")}
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </SurfaceCard>

      <ResearchWorkspace query={contextQuery} sessionId={currentSessionId} />

      {projectModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-[420px] rounded-app border border-app-border bg-white p-5 shadow-app">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-app-text">{t("chat.createProjectTitle")}</h2>
              <button
                type="button"
                onClick={() => setProjectModalOpen(false)}
                className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted"
              >
                {t("common.close")}
              </button>
            </div>
            <input
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className="w-full rounded-app border border-app-border bg-app-bg px-4 py-3 text-sm outline-none focus:border-app-primary"
              placeholder={t("chat.projectName")}
            />
            <button
              type="button"
              onClick={() => void saveProject()}
              className="mt-3 h-11 w-full rounded-app bg-app-primary text-sm font-semibold text-white"
            >
              {t("common.save")}
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

function chatFileLabels(language: string) {
  if (language === "en") {
    return {
      fileAttached: "File attachment",
      imageAttached: "Image attachment",
      attachedFile: "Attached file",
      name: "Name",
      fileName: "File name",
      type: "Type",
      size: "Size",
      resolution: "Resolution",
      averageColor: "Average color",
      unknown: "Unknown",
      imageFailed: "Could not analyze the image."
    };
  }
  if (language === "ja") {
    return {
      fileAttached: "ファイル添付",
      imageAttached: "画像添付",
      attachedFile: "添付ファイル",
      name: "名前",
      fileName: "ファイル名",
      type: "形式",
      size: "サイズ",
      resolution: "解像度",
      averageColor: "平均色",
      unknown: "不明",
      imageFailed: "画像を分析できませんでした。"
    };
  }
  return {
    fileAttached: "파일 첨부",
    imageAttached: "이미지 첨부",
    attachedFile: "첨부 파일",
    name: "이름",
    fileName: "파일명",
    type: "형식",
    size: "크기",
    resolution: "해상도",
    averageColor: "평균 색상",
    unknown: "알 수 없음",
    imageFailed: "이미지를 분석하지 못했습니다."
  };
}

function parsePrefixedCommand(message: string, prefixes: string[]) {
  for (const prefix of prefixes) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = message.match(new RegExp(`^${escaped}\\s*[:：→\\-]?\\s*([\\s\\S]+)$`, "iu"));
    if (match?.[1]?.trim()) return match[1].trim();
  }

  return null;
}

function parseLocalAction(message: string): Pick<ChatAction, "type" | "title"> | null {
  const todo = message.match(/^(할 일|할일|todo|to do|TODO|タスク)\s*[:：→\-]?\s*(.+)$/iu);
  if (todo?.[2]?.trim()) {
    return { type: "todo", title: todo[2].trim() };
  }

  const schedule = message.match(/^(예약|일정|schedule|予約|予定)\s*[:：→\-]?\s*(.+)$/iu);
  if (schedule?.[2]?.trim()) {
    return { type: "schedule", title: schedule[2].trim() };
  }

  return null;
}

function modeForQuickAction(actionId: ChatQuickActionId): ChatMode {
  if (actionId === "automation" || actionId === "approval_queue" || actionId === "code_run") {
    return "agent";
  }
  return "ask";
}

function isAutomationCreationCommand(message: string) {
  return /(?:자동화|workflow|automation).*(?:만들|생성|구성|추가)|(?:만들|생성|구성).*?(?:자동화|workflow|automation)/iu.test(message);
}

async function readEventStream(
  response: Response,
  handlers: {
    onStatus: (status: ChatStatus) => void;
    onSession: (sessionId: string) => void;
    onSessionRecord: (session: ChatSessionRecord) => void;
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
      memoryStatus?: string;
      memoryCandidates?: MemoryCandidateCardData[];
    }) => void;
    onError: (message: string, code?: string) => void;
  }
) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Streaming response could not be read.");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

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
    status?: ChatStatus;
    session?: ChatSessionRecord;
    code?: string;
    error?: string;
    message?: string;
    memoryStatus?: string;
    memoryCandidates?: MemoryCandidateCardData[];
  };

  try {
    data = JSON.parse(dataRaw) as typeof data;
  } catch {
    handlers.onError("Streaming event could not be parsed.");
    return;
  }

  if (event === "status" && data.status) handlers.onStatus(data.status);
  if (event === "session" && data.sessionId) handlers.onSession(data.sessionId);
  if (event === "session" && data.session) handlers.onSessionRecord(data.session);
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
      sessionId: data.sessionId,
      memoryStatus: data.memoryStatus,
      memoryCandidates: data.memoryCandidates || []
    });
  }
  if (event === "error") handlers.onError(data.message || data.error || "Streaming interrupted", data.code);
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
