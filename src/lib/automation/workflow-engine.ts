import type { AutomationRunStep } from "./run.repository";
import type { AutomationScenario, ScenarioNode } from "./scenario-designer";

/**
 * Graph-aware scenario execution: follows edges from the trigger, resolves
 * {{trigger.*}} / {{steps.<nodeId>.*}} mappings with a safe path parser
 * (never eval), evaluates filter/router branches, and keeps the approval
 * policy — external sends are only marked approval_required here.
 */

export type WorkflowContext = {
  trigger: Record<string, unknown>;
  steps: Record<string, Record<string, unknown>>;
  /** Current iterator item, referenced as {{item.*}} inside an iteration. */
  item?: unknown;
};

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_.[\]-]{1,200})\s*\}\}/gu;
const MAX_ITERATOR_ITEMS = 20;

/** Resolves a dotted/indexed path like "email.from" or "items[0].name". */
export function resolvePath(root: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/gu, ".$1")
    .split(".")
    .filter(Boolean);
  let current: unknown = root;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current) && /^\d+$/u.test(segment)) {
      current = current[Number(segment)];
    } else if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export function resolveTemplate(value: string, context: WorkflowContext): string {
  return value.replace(TEMPLATE_PATTERN, (_match, path: string) => {
    const resolved = path.startsWith("trigger.")
      ? resolvePath(context.trigger, path.slice("trigger.".length))
      : path === "trigger"
        ? context.trigger
        : path.startsWith("steps.")
          ? resolvePath(context.steps, path.slice("steps.".length))
          : path.startsWith("item.")
            ? resolvePath(context.item, path.slice("item.".length))
            : path === "item"
              ? context.item
              : undefined;
    if (resolved === undefined || resolved === null) return "";
    return typeof resolved === "string" ? resolved : JSON.stringify(resolved);
  });
}

export function resolveNodeConfig(
  node: ScenarioNode,
  context: WorkflowContext
): Record<string, string | number | boolean> {
  const resolved: Record<string, string | number | boolean> = {};
  for (const [key, raw] of Object.entries(node.config || {})) {
    resolved[key] = typeof raw === "string" ? resolveTemplate(raw, context) : raw;
  }
  return resolved;
}

export type FilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "is_empty"
  | "is_not_empty"
  | "exists"
  | "not_exists"
  | "regex";

export function evaluateCondition(
  config: { path?: unknown; operator?: unknown; value?: unknown },
  context: WorkflowContext
): boolean {
  const path = String(config.path || "").trim();
  const operator = String(config.operator || "exists") as FilterOperator;
  const expected = String(config.value ?? "");
  const raw = path ? resolveTemplate(`{{${path}}}`, context) : "";

  switch (operator) {
    case "equals":
      return raw === expected;
    case "not_equals":
      return raw !== expected;
    case "contains":
      return raw.includes(expected);
    case "not_contains":
      return !raw.includes(expected);
    case "starts_with":
      return raw.startsWith(expected);
    case "ends_with":
      return raw.endsWith(expected);
    case "gt":
      return Number(raw) > Number(expected);
    case "lt":
      return Number(raw) < Number(expected);
    case "gte":
      return Number(raw) >= Number(expected);
    case "lte":
      return Number(raw) <= Number(expected);
    case "is_empty":
      return raw.trim() === "";
    case "is_not_empty":
      return raw.trim() !== "";
    case "not_exists":
      return raw === "";
    case "regex":
      try {
        return new RegExp(expected.slice(0, 200), "u").test(raw);
      } catch {
        return false;
      }
    case "exists":
    default:
      return raw !== "";
  }
}

const EXTERNAL_SEND_APPS = new Set([
  "gmail",
  "slack",
  "discord",
  "notion",
  "github",
  "google-sheets",
  "drive",
  "calendar",
  "webhook",
  "outlook",
  "onedrive",
  "dropbox"
]);

export type GraphExecutionResult = {
  steps: AutomationRunStep[];
  status: "success" | "partial" | "failed" | "waiting";
  context: WorkflowContext;
  /** Set when a delay node paused the run; the scheduler resumes it. */
  waiting?: { nodeId: string; resumeAt: string; completedNodeIds: string[] };
};

export function executeScenarioGraph(
  scenario: AutomationScenario,
  options: {
    triggerData?: Record<string, unknown>;
    connectedApps?: Set<string>;
    /** Resume data from a waiting run: nodes already executed are skipped. */
    resume?: { context?: WorkflowContext; completedNodeIds?: string[] };
  } = {}
): GraphExecutionResult {
  const connected = options.connectedApps || new Set<string>();
  const context: WorkflowContext = options.resume?.context
    ? structuredClone(options.resume.context)
    : { trigger: options.triggerData || {}, steps: {} };
  const completed = new Set(options.resume?.completedNodeIds || []);
  const order = buildExecutionOrder(scenario);
  const skipped = new Set<string>();
  const outgoing = new Map<string, Array<{ target: string; label?: string }>>();
  for (const edge of scenario.edges) {
    const list = outgoing.get(edge.source) || [];
    list.push({ target: edge.target, label: edge.label });
    outgoing.set(edge.source, list);
  }

  const markDownstreamSkipped = (nodeId: string, keep?: Set<string>) => {
    const queue = (outgoing.get(nodeId) || [])
      .filter((edge) => !keep || !keep.has(edge.target))
      .map((edge) => edge.target);
    while (queue.length > 0) {
      const next = queue.shift()!;
      if (skipped.has(next)) continue;
      skipped.add(next);
      for (const edge of outgoing.get(next) || []) queue.push(edge.target);
    }
  };

  const steps: AutomationRunStep[] = [];
  const expandedByIterator = new Set<string>();
  let waiting: GraphExecutionResult["waiting"];

  for (let index = 0; index < order.length; index += 1) {
    const node = order[index];
    const base = {
      nodeId: node.id,
      label: node.label,
      operation: node.operation,
      order: index + 1
    };

    if (waiting) break;
    if (completed.has(node.id) || expandedByIterator.has(node.id)) continue;

    if (skipped.has(node.id)) {
      steps.push({ ...base, status: "skipped", detail: "조건에 의해 건너뛰었습니다." });
      continue;
    }

    const resolved = resolveNodeConfig(node, context);

    if (node.appId === "delay") {
      const minutes = Math.max(0, Math.min(7 * 24 * 60, Number(resolved.delayMinutes) || 0));
      if (minutes > 0) {
        const resumeAt = new Date(Date.now() + minutes * 60_000).toISOString();
        steps.push({
          ...base,
          status: "success",
          detail: `${minutes}분 대기를 예약했습니다. ${resumeAt.slice(11, 16)} UTC에 이어서 실행됩니다.`
        });
        context.steps[node.id] = { resumeAt };
        waiting = {
          nodeId: node.id,
          resumeAt,
          completedNodeIds: [
            ...completed,
            ...steps.filter((step) => step.status !== "skipped").map((step) => step.nodeId),
            node.id
          ]
        };
        break;
      }
      steps.push({ ...base, status: "success", detail: "대기 시간이 0이라 바로 진행합니다." });
      continue;
    }

    if (node.appId === "iterator") {
      const rawItems = resolved.path
        ? resolvePath(
            { trigger: context.trigger, steps: context.steps, item: context.item },
            String(resolved.path)
          )
        : undefined;
      const items = Array.isArray(rawItems)
        ? rawItems.slice(0, Math.max(1, Math.min(MAX_ITERATOR_ITEMS, Number(resolved.maxItems) || 10)))
        : [];
      const nextEdge = (outgoing.get(node.id) || [])[0];
      const nextNode = nextEdge ? order.find((candidate) => candidate.id === nextEdge.target) : undefined;
      context.steps[node.id] = { itemCount: items.length };
      if (items.length === 0 || !nextNode) {
        steps.push({
          ...base,
          status: items.length === 0 ? "skipped" : "success",
          detail: items.length === 0 ? "반복할 항목이 없습니다." : "다음 노드가 없어 반복을 건너뜁니다."
        });
        continue;
      }
      steps.push({ ...base, status: "success", detail: `${items.length}개 항목을 반복 실행합니다.` });
      items.forEach((item, itemIndex) => {
        const itemContext: WorkflowContext = { ...context, item };
        const itemResolved = resolveNodeConfig(nextNode, itemContext);
        const itemBase = {
          nodeId: `${nextNode.id}#${itemIndex + 1}`,
          label: `${nextNode.label} (${itemIndex + 1}/${items.length})`,
          operation: nextNode.operation,
          order: index + 1
        };
        if (nextNode.requiresCredential && !nextNode.credentialId && !connected.has(nextNode.appId)) {
          steps.push({ ...itemBase, status: "failed", detail: "연결된 계정이 없어 실행할 수 없습니다." });
        } else if (EXTERNAL_SEND_APPS.has(nextNode.appId) && nextNode.kind === "action") {
          steps.push({
            ...itemBase,
            status: "approval_required",
            detail: "외부 전송 작업은 사용자 승인 후 실행됩니다.",
            resolvedConfig: itemResolved
          });
        } else {
          steps.push({ ...itemBase, status: "success", detail: "항목 단계가 실행되었습니다." });
        }
      });
      expandedByIterator.add(nextNode.id);
      continue;
    }

    if (node.appId === "aggregator" || node.appId.includes("aggregator")) {
      const summary = {
        total: 0,
        success: 0,
        failed: 0,
        pendingApproval: 0
      };
      for (const step of steps) {
        if (!step.nodeId.includes("#")) continue;
        summary.total += 1;
        if (step.status === "success") summary.success += 1;
        else if (step.status === "failed") summary.failed += 1;
        else if (step.status === "approval_required") summary.pendingApproval += 1;
      }
      context.steps[node.id] = { ...summary };
      steps.push({
        ...base,
        status: "success",
        detail: `집계: 총 ${summary.total}건 (성공 ${summary.success}, 승인 대기 ${summary.pendingApproval}, 실패 ${summary.failed})`
      });
      continue;
    }

    if (node.appId === "filter") {
      const passed = evaluateCondition(resolved, context);
      context.steps[node.id] = { passed, config: resolved };
      if (!passed) {
        markDownstreamSkipped(node.id);
        steps.push({ ...base, status: "skipped", detail: "필터 조건이 충족되지 않아 이후 경로를 건너뜁니다." });
        continue;
      }
      steps.push({ ...base, status: "success", detail: "필터 조건을 통과했습니다." });
      continue;
    }

    if (node.appId === "router") {
      const value = String(resolved.path ? resolveTemplate(`{{${resolved.path}}}`, context) : "");
      const routes = outgoing.get(node.id) || [];
      const matched =
        routes.find((route) => route.label && route.label === value) ||
        routes.find((route) => !route.label);
      const keep = new Set(matched ? [matched.target] : []);
      markDownstreamSkipped(node.id, keep);
      context.steps[node.id] = { matched: matched?.label ?? "(기본 경로)", value };
      steps.push({
        ...base,
        status: matched ? "success" : "skipped",
        detail: matched
          ? `"${value}" → ${matched.label || "기본 경로"} 분기를 선택했습니다.`
          : "일치하는 분기가 없어 모든 경로를 건너뜁니다."
      });
      continue;
    }

    if (node.requiresCredential && !node.credentialId && !connected.has(node.appId)) {
      steps.push({ ...base, status: "failed", detail: "연결된 계정이 없어 실행할 수 없습니다." });
      context.steps[node.id] = { config: resolved, failed: true };
      continue;
    }
    if (EXTERNAL_SEND_APPS.has(node.appId) && node.kind === "action") {
      steps.push({
        ...base,
        status: "approval_required",
        detail: "외부 전송 작업은 사용자 승인 후 실행됩니다.",
        resolvedConfig: resolved
      });
      context.steps[node.id] = { config: resolved, pendingApproval: true };
      continue;
    }
    steps.push({ ...base, status: "success", detail: "내부 단계가 실행되었습니다." });
    context.steps[node.id] = { config: resolved, output: resolved };
  }

  const failed = steps.some((step) => step.status === "failed");
  const needsApproval = steps.some((step) => step.status === "approval_required");
  return {
    steps,
    status: waiting ? "waiting" : failed ? "failed" : needsApproval ? "partial" : "success",
    context,
    waiting
  };
}

/** Edge-based breadth-first order from the trigger; falls back to node order. */
function buildExecutionOrder(scenario: AutomationScenario): ScenarioNode[] {
  if (scenario.edges.length === 0) return scenario.nodes;
  const byId = new Map(scenario.nodes.map((node) => [node.id, node]));
  const targets = new Set(scenario.edges.map((edge) => edge.target));
  const roots = scenario.nodes.filter((node) => !targets.has(node.id));
  const order: ScenarioNode[] = [];
  const visited = new Set<string>();
  const queue = (roots.length > 0 ? roots : scenario.nodes.slice(0, 1)).map((node) => node.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) order.push(node);
    for (const edge of scenario.edges.filter((candidate) => candidate.source === id)) {
      queue.push(edge.target);
    }
  }
  for (const node of scenario.nodes) if (!visited.has(node.id)) order.push(node);
  return order;
}
