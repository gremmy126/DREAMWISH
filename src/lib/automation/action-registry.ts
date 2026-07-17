import { listActionDefinitions } from "./registry/action-registry";
import type { ActionDefinition } from "./registry/action.types";

export type AutomationAction = {
  id: string;
  label: string;
  group: "trigger" | "read" | "create" | "update" | "delete" | "advanced";
};

/**
 * Compatibility view for the existing action picker.
 * The declarative Action Registry is the only source of action metadata.
 */
export function listAutomationActions(appId: string): AutomationAction[] {
  return listActionDefinitions(appId).map((definition) => ({
    id: definition.id,
    label: definition.name,
    group: toLegacyGroup(definition)
  }));
}

function toLegacyGroup(definition: ActionDefinition): AutomationAction["group"] {
  if (definition.kind === "trigger") return "trigger";
  if (definition.kind === "read") return "read";
  if (definition.kind === "tool") return "advanced";
  if (/delete|remove|cancel|refund|revoke|archive/u.test(definition.id)) return "delete";
  if (/update|edit|move|add|append|publish|send|reply|invite|deploy|create-release/u.test(definition.id)) {
    return "update";
  }
  return "create";
}
