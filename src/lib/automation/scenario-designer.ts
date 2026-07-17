import { AUTOMATION_APPS } from "./app-registry";
import { isActionExecutable, listActionDefinitions } from "./registry/action-registry";
import type { ActionValue } from "./registry/action.types";
import { AUTOMATION_TOOLS } from "./tool-registry";

export type ScenarioStatus = "draft" | "active" | "paused" | "error";
export type ScenarioNodeKind = "trigger" | "action" | "tool";
export type ScenarioConfig = Record<string, ActionValue>;

export type AutomationModule = {
  id: string;
  label: string;
  category: "app" | "tool" | "ai";
  color: string;
  glyph: string;
  defaultKind: ScenarioNodeKind;
  requiresCredential: boolean;
};

export type ScenarioNode = {
  id: string;
  appId: string;
  label: string;
  actionId?: string | null;
  actionVersion?: number | null;
  operation: string;
  kind: ScenarioNodeKind;
  position: { x: number; y: number };
  requiresCredential: boolean;
  credentialId: string | null;
  config: ScenarioConfig;
};

export type ScenarioEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type AutomationScenario = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  status: ScenarioStatus;
  realtime: boolean;
  nodes: ScenarioNode[];
  edges: ScenarioEdge[];
  runs: number;
  successfulRuns: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScenarioValidationIssue = {
  code: "NO_TRIGGER" | "DISCONNECTED_NODE" | "MISSING_CREDENTIAL" | "EMPTY_SCENARIO";
  nodeId?: string;
  message: string;
};

const CORE_AUTOMATION_MODULES: AutomationModule[] = [
  defineModule("schedule", "Schedule", "tool", "#10b981", "◷", "trigger", false),
  defineModule("gmail", "Gmail", "app", "#ef4444", "M", "action", true),
  defineModule("google-sheets", "Google Sheets", "app", "#16a34a", "S", "action", true),
  defineModule("slack", "Slack", "app", "#7c3aed", "S", "action", true),
  defineModule("notion", "Notion", "app", "#111827", "N", "action", true),
  defineModule("calendar", "Google Calendar", "app", "#2563eb", "C", "action", true),
  defineModule("discord", "Discord", "app", "#6366f1", "D", "action", true),
  defineModule("telegram", "Telegram", "app", "#0ea5e9", "T", "action", true),
  defineModule("github", "GitHub", "app", "#111827", "G", "action", true),
  defineModule("drive", "Google Drive", "app", "#f59e0b", "D", "action", true),
  defineModule("crm", "DREAMWISH CRM", "app", "#ec4899", "C", "action", false),
  defineModule("webhook", "Webhooks", "tool", "#db2777", "W", "trigger", true),
  defineModule("http", "HTTP 요청", "tool", "#0284c7", "H", "action", true),
  defineModule("ai", "AI 분석", "ai", "#6d5dfc", "✦", "action", false),
  defineModule("router", "라우터", "tool", "#22c55e", "R", "tool", false),
  defineModule("filter", "필터", "tool", "#8b5cf6", "F", "tool", false),
  defineModule("code", "코드", "tool", "#f97316", "{ }", "tool", false),
  defineModule("delay", "지연", "tool", "#a855f7", "◴", "tool", false),
  defineModule("iterator", "반복", "tool", "#06b6d4", "↻", "tool", false)
];

export const AUTOMATION_MODULES: AutomationModule[] = [
  ...CORE_AUTOMATION_MODULES,
  ...AUTOMATION_APPS.filter((app) => !CORE_AUTOMATION_MODULES.some((module) => module.id === app.id)).map((app) =>
    defineModule(app.id, app.label, "app", app.color, "", "action", app.authType !== "none")
  ),
  ...AUTOMATION_TOOLS.filter((tool) => !CORE_AUTOMATION_MODULES.some((module) => module.id === tool.id)).map((tool) =>
    defineModule(tool.id, tool.label, "tool", tool.color, "", "tool", false)
  )
];

export function buildScenarioFromPrompt(prompt: string, ownerId = "preview-owner") {
  const normalized = prompt.trim();
  const moduleIds = detectModules(normalized);
  if (!moduleIds.some((id) => getModule(id).defaultKind === "trigger")) {
    moduleIds.unshift("schedule");
  }
  const now = new Date().toISOString();
  const nodes = moduleIds.map((appId, index) => {
    const item = getModule(appId);
    const definition = selectInitialAction(appId, normalized);
    return {
      id: `node-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
      appId,
      label: item.label,
      actionId: definition?.id || null,
      actionVersion: definition?.version || null,
      operation: definition?.name || inferOperation(appId, normalized),
      kind: index === 0 ? "trigger" : item.defaultKind === "trigger" ? "action" : item.defaultKind,
      position: { x: 90 + index * 230, y: index % 2 === 0 ? 180 : 340 },
      requiresCredential: item.requiresCredential,
      credentialId: item.requiresCredential ? `pending-${appId}` : null,
      config: inferConfig(appId, normalized)
    } satisfies ScenarioNode;
  });
  return {
    id: crypto.randomUUID(),
    ownerId,
    name: buildScenarioName(normalized, moduleIds),
    description: normalized || "새 자동화 시나리오",
    status: "draft",
    realtime: false,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: `edge-${nodes[index]!.id}-${node.id}`,
      source: nodes[index]!.id,
      target: node.id
    })),
    runs: 0,
    successfulRuns: 0,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now
  } satisfies AutomationScenario;
}

export function validateScenario(scenario: AutomationScenario) {
  const issues: ScenarioValidationIssue[] = [];
  if (scenario.nodes.length === 0) {
    issues.push({ code: "EMPTY_SCENARIO", message: "모듈을 하나 이상 추가하세요." });
  }
  if (!scenario.nodes.some((node) => node.kind === "trigger")) {
    issues.push({ code: "NO_TRIGGER", message: "시나리오를 시작할 트리거가 필요합니다." });
  }
  const connected = new Set(scenario.edges.flatMap((edge) => [edge.source, edge.target]));
  for (const node of scenario.nodes) {
    if (scenario.nodes.length > 1 && !connected.has(node.id)) {
      issues.push({ code: "DISCONNECTED_NODE", nodeId: node.id, message: `${node.label} 모듈이 연결되지 않았습니다.` });
    }
    if (node.requiresCredential && !node.credentialId) {
      issues.push({ code: "MISSING_CREDENTIAL", nodeId: node.id, message: `${node.label} 계정 또는 API 키를 연결하세요.` });
    }
  }
  return { valid: issues.length === 0, issues };
}

export function createScenarioNode(appId: string, index: number): ScenarioNode {
  const item = getModule(appId);
  const definition = selectInitialAction(appId, "");
  return {
    id: `node-${crypto.randomUUID()}`,
    appId,
    label: item.label,
    actionId: definition?.id || null,
    actionVersion: definition?.version || null,
    operation: definition?.name || (item.defaultKind === "trigger" ? "이벤트 감지" : "작업 실행"),
    kind: definition?.kind === "trigger" ? "trigger" : definition?.kind === "tool" ? "tool" : item.defaultKind,
    position: { x: 140 + (index % 3) * 250, y: 140 + Math.floor(index / 3) * 200 },
    requiresCredential: item.requiresCredential,
    credentialId: null,
    config: structuredClone(definition?.defaultValues || {})
  };
}

function selectInitialAction(appId: string, prompt: string) {
  const definitions = listActionDefinitions(appId).filter((definition) =>
    isActionExecutable(definition.appId, definition.id, definition.version)
  );
  if (definitions.length === 0) return null;
  const lowered = prompt.toLowerCase();
  if (appId === "gmail" && /보내|발송|send/u.test(lowered)) {
    return definitions.find((item) => item.id === "send-email") || definitions[0]!;
  }
  if (appId === "slack" && /보내|발송|send/u.test(lowered)) {
    return definitions.find((item) => item.id === "send-message") || definitions[0]!;
  }
  return definitions[0]!;
}

function defineModule(id: string, label: string, category: AutomationModule["category"], color: string, glyph: string, defaultKind: ScenarioNodeKind, requiresCredential: boolean): AutomationModule {
  return { id, label, category, color, glyph, defaultKind, requiresCredential };
}

function getModule(id: string) {
  return AUTOMATION_MODULES.find((item) => item.id === id) || AUTOMATION_MODULES[0]!;
}

function detectModules(prompt: string) {
  const result: string[] = [];
  const rules: Array<[string, RegExp]> = [
    ["schedule", /(매일|매주|오전|오후|시마다|일정|schedule)/iu],
    ["webhook", /(webhook|웹훅)/iu],
    ["gmail", /(gmail|지메일|메일)/iu],
    ["calendar", /(calendar|캘린더|일정 등록)/iu],
    ["google-sheets", /(sheet|시트|스프레드시트)/iu],
    ["slack", /(slack|슬랙)/iu],
    ["notion", /(notion|노션)/iu],
    ["discord", /(discord|디스코드)/iu],
    ["telegram", /(telegram|텔레그램)/iu],
    ["github", /(github|깃허브)/iu],
    ["drive", /(drive|드라이브)/iu],
    ["crm", /(crm|고객|리드)/iu],
    ["http", /(http|api)/iu],
    ["ai", /(ai|요약|분석|생성)/iu]
  ];
  for (const [id, pattern] of rules) if (pattern.test(prompt)) result.push(id);
  return result.length > 0 ? [...new Set(result)] : ["schedule", "ai"];
}

function inferOperation(appId: string, prompt: string) {
  if (appId === "schedule") return prompt.match(/(매일|매주|오전|오후)[^,，.]*/u)?.[0] || "예약 실행";
  if (appId === "gmail") return /보내|발송/u.test(prompt) ? "이메일 보내기" : "새 이메일 확인";
  if (appId === "slack") return "메시지 보내기";
  if (appId === "ai") return /요약/u.test(prompt) ? "콘텐츠 요약" : "콘텐츠 분석";
  if (appId === "webhook") return "요청 수신";
  if (appId === "http") return "API 요청";
  return "작업 실행";
}

function inferConfig(appId: string, prompt: string): Record<string, ActionValue> {
  if (appId === "schedule") return { schedule: prompt.match(/(매일|매주).{0,20}/u)?.[0] || "매일 09:00" };
  return {};
}

function buildScenarioName(prompt: string, moduleIds: string[]) {
  if (prompt) return prompt.length > 34 ? `${prompt.slice(0, 34)}…` : prompt;
  return moduleIds.map((id) => getModule(id).label).join(" → ");
}
