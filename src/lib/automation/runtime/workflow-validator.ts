import type { AutomationScenario, ScenarioNode } from "../scenario-designer";
import { getActionDefinition, isActionExecutable } from "../registry/action-registry";
import { validateActionInput } from "../registry/schema-runtime";
import { getIntegrationConnection } from "../../repositories/integration-connection.repository";
import { missingOAuthScopes } from "../../oauth/scope-matcher";

export type WorkflowValidationCode =
  | "EMPTY_WORKFLOW"
  | "NO_TRIGGER"
  | "DANGLING_EDGE"
  | "DISCONNECTED_NODE"
  | "CYCLE_DETECTED"
  | "ACTION_NOT_FOUND"
  | "ACTION_INPUT_INVALID"
  | "ADAPTER_NOT_IMPLEMENTED"
  | "CONNECTION_REQUIRED"
  | "CONNECTION_NOT_FOUND"
  | "CONNECTION_APP_MISMATCH"
  | "CREDENTIAL_INVALID"
  | "SCOPE_INSUFFICIENT";

export type WorkflowValidationIssue = { code: WorkflowValidationCode; message: string; nodeId?: string; fields?: string[] };

export function validateWorkflowStructure(scenario: AutomationScenario) {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set(scenario.nodes.map((node) => node.id));
  if (scenario.nodes.length === 0) issues.push({ code: "EMPTY_WORKFLOW", message: "워크플로에 노드가 없습니다." });
  if (!scenario.nodes.some((node) => node.kind === "trigger")) issues.push({ code: "NO_TRIGGER", message: "워크플로에는 하나 이상의 Trigger가 필요합니다." });
  for (const edge of scenario.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) issues.push({ code: "DANGLING_EDGE", message: "존재하지 않는 노드를 참조하는 연결이 있습니다." });
  }
  if (scenario.nodes.length > 1) {
    const connected = new Set(scenario.edges.flatMap((edge) => [edge.source, edge.target]));
    for (const node of scenario.nodes) if (!connected.has(node.id)) issues.push({ code: "DISCONNECTED_NODE", nodeId: node.id, message: `${node.label} 노드가 연결되지 않았습니다.` });
  }
  if (hasCycle(scenario)) issues.push({ code: "CYCLE_DETECTED", message: "순환 참조가 감지되었습니다. 명시적인 Iterator를 사용하세요." });
  for (const node of scenario.nodes) validateNodeDefinition(node, issues);
  return { valid: issues.length === 0, issues };
}

export async function validateWorkflowForActivation(ownerId: string, scenario: AutomationScenario) {
  const structural = validateWorkflowStructure(scenario);
  const issues = [...structural.issues];
  for (const node of scenario.nodes) {
    if (node.appId === "filter") continue;
    const definition = node.actionId ? getActionDefinition(node.appId, node.actionId, node.actionVersion || undefined) : null;
    if (!definition || definition.requiredScopes.length === 0) continue;
    if (!node.credentialId || node.credentialId.startsWith("pending-")) {
      issues.push({ code: "CONNECTION_REQUIRED", nodeId: node.id, message: `${node.label}에서 사용할 연결 계정을 선택하세요.` });
      continue;
    }
    const connection = await getIntegrationConnection(ownerId, node.credentialId);
    if (!connection) {
      issues.push({ code: "CONNECTION_NOT_FOUND", nodeId: node.id, message: `${node.label} 연결 계정을 찾을 수 없습니다.` });
      continue;
    }
    if (connection.appId !== node.appId) {
      issues.push({ code: "CONNECTION_APP_MISMATCH", nodeId: node.id, message: `${node.label}에 다른 앱의 연결 계정이 선택되었습니다.` });
      continue;
    }
    if (connection.status !== "connected" || !connection.accessTokenCiphertext || (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now())) {
      issues.push({ code: "CREDENTIAL_INVALID", nodeId: node.id, message: `${node.label} 연결을 테스트하거나 다시 인증하세요.` });
      continue;
    }
    const missing = missingOAuthScopes(connection.grantedScopes, definition.requiredScopes, node.appId);
    if (missing.length > 0) issues.push({ code: "SCOPE_INSUFFICIENT", nodeId: node.id, fields: missing, message: `${node.label} 연결에 필요한 Scope가 없습니다: ${missing.join(", ")}` });
  }
  return { valid: issues.length === 0, issues };
}

function validateNodeDefinition(node: ScenarioNode, issues: WorkflowValidationIssue[]) {
  if (node.appId === "filter") return;
  if (!node.actionId || !node.actionVersion) {
    issues.push({ code: "ACTION_NOT_FOUND", nodeId: node.id, message: `${node.label}의 Action을 선택하세요.` });
    return;
  }
  const definition = getActionDefinition(node.appId, node.actionId, node.actionVersion);
  if (!definition) {
    issues.push({ code: "ACTION_NOT_FOUND", nodeId: node.id, message: `${node.label}의 ActionDefinition 버전을 찾을 수 없습니다.` });
    return;
  }
  if (!isActionExecutable(node.appId, node.actionId, node.actionVersion)) {
    issues.push({ code: "ADAPTER_NOT_IMPLEMENTED", nodeId: node.id, message: `${definition.name} Adapter는 아직 준비 중입니다.` });
  }
  const validation = validateActionInput(definition, node.config);
  if (!validation.valid) issues.push({ code: "ACTION_INPUT_INVALID", nodeId: node.id, fields: Object.keys(validation.errors), message: `${definition.name} 필수 입력값을 확인하세요.` });
}

function hasCycle(scenario: AutomationScenario) {
  const outgoing = new Map<string, string[]>();
  for (const node of scenario.nodes) outgoing.set(node.id, []);
  for (const edge of scenario.edges) if (outgoing.has(edge.source) && outgoing.has(edge.target)) outgoing.get(edge.source)!.push(edge.target);
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of outgoing.get(nodeId) || []) if (visit(next)) return true;
    visiting.delete(nodeId); visited.add(nodeId); return false;
  };
  return scenario.nodes.some((node) => visit(node.id));
}
