import { ACTION_CATALOG } from "./action-catalog";
import type { ActionDefinition } from "./action.types";
import { isAdapterImplementationAvailable } from "../adapters/adapter-availability";
import { enrichActionDefinitionGuide } from "./action-guide";

export const ACTION_DEFINITIONS: readonly ActionDefinition[] = Object.freeze(
  ACTION_CATALOG.map((definition) => Object.freeze(enrichActionDefinitionGuide(definition)))
);

const byIdentity = new Map(
  ACTION_DEFINITIONS.map((definition) => [identity(definition.appId, definition.id, definition.version), definition])
);

export function listActionDefinitions(appId: string): ActionDefinition[] {
  return ACTION_DEFINITIONS.filter((definition) => definition.appId === appId).map((definition) => structuredClone(definition));
}

export function getActionDefinition(appId: string, actionId: string, version?: number): ActionDefinition | null {
  if (version !== undefined) {
    const exact = byIdentity.get(identity(appId, actionId, version));
    return exact ? structuredClone(exact) : null;
  }
  const matches = ACTION_DEFINITIONS.filter((definition) => definition.appId === appId && definition.id === actionId);
  const latest = matches.sort((left, right) => right.version - left.version)[0];
  return latest ? structuredClone(latest) : null;
}

export function isActionExecutable(appId: string, actionId: string, version?: number) {
  const definition = getActionDefinition(appId, actionId, version);
  return Boolean(
    definition && isAdapterImplementationAvailable(definition.adapterKey, definition.adapterVersion)
  );
}

function identity(appId: string, actionId: string, version: number) {
  return `${appId}:${actionId}:${version}`;
}

export type { ActionDefinition } from "./action.types";
