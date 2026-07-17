import { getAutomationApp } from "../app-registry";
import type { AutomationScenario } from "../scenario-designer";
import { ACTION_CATALOG } from "./action-catalog";
import type {
  ActionDefinition,
  ActionFieldDefinition,
  ActionGuideDefinition,
  ActionOutputField,
  ActionValue
} from "./action.types";

export type MappingSource = {
  label: string;
  template: string;
  type: string;
  nodeId: string | null;
};

const ACTION_OVERRIDES: Record<string, Partial<ActionGuideDefinition>> = {
  "gmail:watch-new-email": {
    summary: "Gmail에서 조건에 맞는 새 메일을 감지해 시나리오를 시작합니다.",
    useWhen: "받은 메일의 본문·제목·보낸 사람을 AI 분석이나 Notion 저장 같은 다음 단계로 넘길 때 사용합니다.",
    outputMappings: [
      { label: "메일 ID", template: "{{trigger.email.messageId}}" },
      { label: "보낸 사람", template: "{{trigger.email.from}}" },
      { label: "받는 사람", template: "{{trigger.email.to}}" },
      { label: "제목", template: "{{trigger.email.subject}}" },
      { label: "본문", template: "{{trigger.email.body}}" },
      { label: "미리보기", template: "{{trigger.email.snippet}}" }
    ]
  },
  "notion:create-page": {
    summary: "선택한 Notion 상위 페이지나 데이터베이스 아래에 새 페이지를 만듭니다.",
    useWhen: "메일 요약, 회의 결과, CRM 정보처럼 이전 단계의 결과를 Notion 문서로 남길 때 사용합니다."
  },
  "ai:summarize": {
    summary: "이전 단계에서 받은 긴 텍스트를 AI가 핵심 내용으로 요약합니다.",
    useWhen: "메일 본문, 문서 내용, 회의 기록을 다음 앱에 저장하기 전에 짧고 구조화된 내용으로 만들 때 사용합니다."
  },
  "ai:analyze-email": {
    summary: "메일 본문에서 중요도, 의도, 요청 사항과 후속 조치를 분석합니다.",
    useWhen: "Gmail 트리거 뒤에서 메일을 분류하거나 Notion·CRM에 분석 결과를 저장할 때 사용합니다."
  },
  "webhook:custom-webhook": {
    useWhen: "외부 서비스가 HTTP 요청을 보낼 때 즉시 시나리오를 시작해야 하는 경우 사용합니다."
  }
};

const FIELD_SOURCES: Record<string, string> = {
  messageId: "Gmail 트리거의 메일 ID를 매핑하거나 Gmail API 응답의 messageId를 사용합니다.",
  threadId: "Gmail 트리거 또는 이전 Gmail 작업 출력의 threadId를 사용합니다.",
  pageId: "Notion에서 대상 페이지를 열고 URL 마지막의 32자리 페이지 ID를 복사합니다.",
  parentPageId: "Notion 상위 페이지 URL의 마지막 32자리 ID를 복사합니다. 해당 페이지를 Integration과 공유해야 합니다.",
  databaseId: "Notion 데이터베이스를 전체 페이지로 열고 URL의 데이터베이스 ID를 복사합니다.",
  channelId: "Slack·Discord 채널 정보 또는 채널 URL에서 ID를 확인합니다.",
  fileId: "이전 파일 생성·검색 단계의 출력 ID를 매핑하거나 앱의 파일 URL에서 확인합니다.",
  folderId: "대상 폴더 URL 또는 이전 폴더 검색 단계의 출력 ID를 사용합니다.",
  spreadsheetId: "Google Sheets URL의 /d/와 /edit 사이 값을 복사합니다.",
  range: "시트 이름과 A1 표기법을 함께 입력합니다. 예: Sheet1!A1:D20",
  repository: "GitHub 저장소의 owner/name을 입력합니다. 예: dreamwish/app",
  issueNumber: "GitHub 이슈 URL 끝 번호 또는 이전 이슈 생성 결과를 사용합니다.",
  pullNumber: "GitHub Pull Request URL 끝 번호 또는 이전 PR 결과를 사용합니다.",
  workflowId: "GitHub Actions 워크플로 파일명 또는 API가 반환한 workflow ID를 사용합니다.",
  model: "연결한 AI 제공자가 지원하는 모델 ID를 입력합니다. 비우면 서버 기본 모델을 사용합니다.",
  input: "이전 노드의 출력 매핑을 선택합니다. 메일 분석은 {{trigger.email.body}}를 사용합니다.",
  prompt: "AI가 수행할 구체적인 지시를 자연어로 작성합니다.",
  systemPrompt: "AI의 역할·금지 사항·출력 형식을 지정합니다. 필요한 경우에만 사용합니다.",
  to: "직접 이메일 주소를 입력하거나 Gmail 트리거의 {{trigger.email.from}} 같은 값을 매핑합니다.",
  subject: "직접 제목을 입력하거나 {{trigger.email.subject}} 같은 이전 출력값을 매핑합니다.",
  body: "직접 본문을 입력하거나 AI 노드의 text 출력처럼 이전 단계 결과를 매핑합니다.",
  content: "직접 내용을 입력하거나 이전 AI·문서 노드의 출력값을 매핑합니다.",
  title: "직접 제목을 입력하거나 트리거 제목·이전 단계 출력을 매핑합니다.",
  amount: "결제 앱에 표시된 통화 단위와 금액을 확인해 입력하거나 이전 주문 출력에서 매핑합니다."
};

export function enrichActionDefinitionGuide(definition: ActionDefinition): ActionDefinition {
  const app = getAutomationApp(definition.appId);
  const override = ACTION_OVERRIDES[`${definition.appId}:${definition.id}`] || {};
  const fields = definition.inputSchema.fields.map((field) => enrichField(field, definition));
  const guide: ActionGuideDefinition = {
    summary: override.summary || `${definition.name} 작업은 ${app?.label || definition.appId}에서 ${kindDescription(definition)} 처리합니다.`,
    useWhen: override.useWhen || defaultUseWhen(definition),
    setupSteps: override.setupSteps || setupSteps(definition),
    inputNotes: override.inputNotes || inputNotes(definition),
    outputMappings: override.outputMappings || outputMappings(definition)
  };
  return {
    ...structuredClone(definition),
    inputSchema: { fields },
    guide
  };
}

export function listMappingSources(scenario: AutomationScenario, nodeId: string): MappingSource[] {
  const ancestorIds = collectAncestorIds(scenario, nodeId);
  const sources: MappingSource[] = [];
  for (const node of scenario.nodes) {
    if (!ancestorIds.has(node.id) || !node.actionId) continue;
    const raw = ACTION_CATALOG.find((item) => item.appId === node.appId && item.id === node.actionId && item.version === (node.actionVersion || 1));
    if (!raw) continue;
    const definition = enrichActionDefinitionGuide(raw);
    if (node.kind === "trigger") {
      for (const mapping of definition.guide.outputMappings.filter((item) => item.template.startsWith("{{trigger."))) {
        addUnique(sources, { label: `${node.label} · ${mapping.label}`, template: mapping.template, type: "string", nodeId: node.id });
      }
      for (const field of definition.outputSchema.fields) {
        addUnique(sources, { label: `${node.label} · ${field.label}`, template: `{{trigger.${field.id}}}`, type: field.type, nodeId: node.id });
      }
      continue;
    }
    for (const field of definition.outputSchema.fields) {
      addUnique(sources, { label: `${node.label} · ${field.label}`, template: `{{steps.${node.id}.${field.id}}}`, type: field.type, nodeId: node.id });
    }
  }
  return sources;
}

function enrichField(field: ActionFieldDefinition, definition: ActionDefinition): ActionFieldDefinition {
  const valueSource = field.valueSource || FIELD_SOURCES[field.id] || defaultFieldSource(field, definition);
  const help = field.help || `${field.label} 값을 ${field.required ? "반드시" : "필요한 경우"} 입력합니다. ${valueSource}`;
  const next: ActionFieldDefinition = {
    ...structuredClone(field),
    help,
    valueSource,
    mappingExample: field.mappingExample || mappingExample(field)
  };
  if (!field.secret && field.example === undefined) next.example = fieldExample(field);
  return next;
}

function defaultUseWhen(definition: ActionDefinition) {
  if (definition.kind === "trigger") return `${definition.name} 이벤트가 발생했을 때 자동으로 워크플로를 시작하려면 사용합니다.`;
  if (definition.kind === "read" || definition.riskLevel === "read") return `다음 단계에서 사용할 ${definition.name} 조회 결과가 필요할 때 사용합니다.`;
  if (definition.riskLevel === "high" || definition.riskLevel === "critical") return `${definition.name}처럼 외부 데이터에 중대한 변경이 필요하고 2단계 승인을 거쳐야 할 때 사용합니다.`;
  if (definition.kind === "tool") return `외부 앱 호출 전후에 ${definition.name} 처리가 필요할 때 사용합니다.`;
  return `${definition.name} 결과를 대상 앱에 생성하거나 수정해야 할 때 사용합니다.`;
}

function setupSteps(definition: ActionDefinition) {
  const app = getAutomationApp(definition.appId);
  const steps: string[] = [];
  if (app) {
    steps.push(app.authType === "none" ? "별도 계정 연결 없이 DREAMWISH 내부 권한으로 실행합니다." : `${app.label} 계정을 연결 관리에서 검증합니다. ${app.help}`);
  } else {
    steps.push("이 내부 도구는 별도 외부 계정 연결 없이 실행됩니다.");
  }
  if (definition.requiredScopes.length) steps.push(`연결 계정에 ${definition.requiredScopes.join(", ")} 권한이 있는지 확인합니다.`);
  if (definition.inputSchema.fields.length) steps.push("필수 입력값을 직접 입력하거나 이전 노드 출력에서 매핑합니다.");
  steps.push(definition.riskLevel === "high" || definition.riskLevel === "critical" ? "Preview를 검토하고 1차 경고와 최종 승인을 완료합니다." : "테스트 실행 Preview에서 대상과 예상 결과를 확인합니다.");
  return steps;
}

function inputNotes(definition: ActionDefinition) {
  const notes = ["보라색 매핑 선택기에는 현재 노드까지 연결된 이전 노드 출력만 표시됩니다."];
  if (definition.inputSchema.fields.some((field) => field.type === "resource")) notes.push("리소스 ID는 화면 URL 또는 이전 검색·생성 노드 출력에서 확인합니다.");
  if (definition.confirmationPhrase) notes.push(`최종 승인 시 확인 문구 ${definition.confirmationPhrase}를 정확히 입력해야 할 수 있습니다.`);
  return notes;
}

function outputMappings(definition: ActionDefinition) {
  return definition.outputSchema.fields.map((field) => ({
    label: field.label,
    template: definition.kind === "trigger" ? `{{trigger.${field.id}}}` : `{{steps.<노드ID>.${field.id}}}`
  }));
}

function defaultFieldSource(field: ActionFieldDefinition, definition: ActionDefinition) {
  if (field.secret) return `${getAutomationApp(definition.appId)?.label || definition.appId} 개발자 콘솔에서 발급하고 연결 관리에 저장합니다. 화면에는 원문이 다시 표시되지 않습니다.`;
  if (field.type === "resource") return "대상 앱의 URL·상세 화면에서 ID를 확인하거나 이전 검색/생성 노드의 ID 출력을 매핑합니다.";
  if (field.type === "mapping" || field.mappable) return "직접 입력하거나 현재 노드로 연결된 트리거·이전 단계 출력에서 선택합니다.";
  return "대상 앱 화면에서 확인한 값을 입력합니다.";
}

function fieldExample(field: ActionFieldDefinition): ActionValue {
  const id = field.id.toLowerCase();
  if (field.options?.length) return field.options[0]!.value;
  if (field.type === "boolean") return false;
  if (field.type === "number" || field.type === "integer") return field.min ?? 1;
  if (field.type === "email" || id === "to") return "customer@example.com";
  if (field.type === "url") return "https://example.com/resource";
  if (field.type === "date") return "2026-07-17";
  if (field.type === "datetime") return "2026-07-17T09:00";
  if (field.type === "timezone") return "Asia/Seoul";
  if (field.type === "json" || field.type === "key_value" || field.type === "mapping") return { key: "value" };
  if (field.type === "array" || field.type === "multiselect") return [];
  if (id.includes("pageid") || id.includes("databaseid")) return "a1b2c3d4e5f64789a1b2c3d4e5f64789";
  if (id.includes("messageid")) return "18f0example-message-id";
  if (id.includes("channelid")) return "C0123456789";
  if (id === "repository") return "dreamwish/app";
  if (id === "range") return "Sheet1!A1:D20";
  if (id.includes("title") || id.includes("subject")) return "자동화 처리 결과";
  if (id.includes("body") || id.includes("content") || id.includes("text") || id.includes("prompt")) return "이전 단계의 내용을 처리해주세요.";
  return `${field.label} 값`;
}

function mappingExample(field: ActionFieldDefinition) {
  const id = field.id.toLowerCase();
  if (id === "input" || id.includes("body") || id.includes("content")) return "{{trigger.email.body}}";
  if (id.includes("subject") || id.includes("title")) return "{{trigger.email.subject}}";
  if (id === "to" || id === "email") return "{{trigger.email.from}}";
  if (id.includes("messageid")) return "{{trigger.email.messageId}}";
  return "{{steps.<노드ID>.data}}";
}

function kindDescription(definition: ActionDefinition) {
  if (definition.kind === "trigger") return "이벤트를 감지해";
  if (definition.kind === "read") return "데이터를 조회해";
  if (definition.kind === "tool") return "입력 데이터를 변환·분석해";
  return "외부 리소스를 생성·수정해";
}

function collectAncestorIds(scenario: AutomationScenario, nodeId: string) {
  const incoming = new Map<string, string[]>();
  for (const edge of scenario.edges) incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge.source]);
  const found = new Set<string>();
  const queue = [...(incoming.get(nodeId) || [])];
  while (queue.length) {
    const current = queue.shift()!;
    if (found.has(current)) continue;
    found.add(current);
    queue.push(...(incoming.get(current) || []));
  }
  return found;
}

function addUnique(sources: MappingSource[], source: MappingSource) {
  if (!sources.some((item) => item.template === source.template)) sources.push(source);
}

export function outputTypeForTemplate(definition: ActionDefinition, template: string): ActionOutputField["type"] | "string" {
  const fieldId = template.match(/\.([A-Za-z0-9_-]+)\}\}$/u)?.[1];
  return definition.outputSchema.fields.find((field) => field.id === fieldId)?.type || "string";
}
