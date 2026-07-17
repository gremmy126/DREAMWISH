import { getActionDefinition } from "./registry/action-registry";
import type { ActionDefinition, ActionRiskLevel, ActionValue } from "./registry/action.types";
import type { ScenarioNode } from "./scenario-designer";

export type ActionPreviewModel = {
  title: string;
  appId: string;
  actionId: string;
  actionVersion: number;
  riskLevel: ActionRiskLevel;
  targetValues: Record<string, ActionValue | undefined>;
  beforeValues: Record<string, ActionValue | undefined>;
  afterValues: Record<string, ActionValue | undefined>;
  input: Record<string, unknown>;
  reversible: boolean | "dynamic";
  failureImpact: string;
  confirmationPhrase: string | null;
};

export function changeScenarioAction(
  node: ScenarioNode,
  actionId: string,
  actionVersion?: number
): ScenarioNode {
  const definition = getActionDefinition(node.appId, actionId, actionVersion);
  if (!definition) throw new Error("등록되지 않은 Action입니다.");
  return {
    ...node,
    actionId: definition.id,
    actionVersion: definition.version,
    operation: definition.name,
    kind: definition.kind === "trigger" ? "trigger" : definition.kind === "tool" ? "tool" : "action",
    config: structuredClone(definition.defaultValues)
  };
}

export function buildActionPreview(
  appId: string,
  actionId: string,
  actionVersion: number | undefined,
  input: Record<string, unknown>
): ActionPreviewModel | null {
  const definition = getActionDefinition(appId, actionId, actionVersion);
  if (!definition) return null;
  return buildActionPreviewFromDefinition(definition, input);
}

export function buildActionPreviewFromDefinition(
  definition: ActionDefinition,
  input: Record<string, unknown>
): ActionPreviewModel {
  const masked = maskSensitiveValue(input) as Record<string, unknown>;
  return {
    title: definition.previewDefinition.title,
    appId: definition.appId,
    actionId: definition.id,
    actionVersion: definition.version,
    riskLevel: definition.riskLevel,
    targetValues: Object.fromEntries(
      definition.previewDefinition.targetFields.map((field) => [field, masked[field] as ActionValue | undefined])
    ),
    beforeValues: Object.fromEntries(
      (definition.previewDefinition.beforeFields || []).map((field) => [field, masked[field] as ActionValue | undefined])
    ),
    afterValues: Object.fromEntries(
      (definition.previewDefinition.afterFields || definition.inputSchema.fields.map((field) => field.id)).map((field) => [field, masked[field] as ActionValue | undefined])
    ),
    input: masked,
    reversible: definition.previewDefinition.reversible,
    failureImpact: definition.previewDefinition.failureImpact,
    confirmationPhrase: definition.confirmationPhrase
  };
}

const SENSITIVE_KEY = /authorization|password|secret|token|api[-_]?key|credential|cookie/i;

export function maskSensitiveValue(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key) && value !== null && value !== undefined && value !== "") return "***";
  if (Array.isArray(value)) return value.map((item) => maskSensitiveValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        maskSensitiveValue(childValue, childKey)
      ])
    );
  }
  return value;
}
