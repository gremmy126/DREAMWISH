import type {
  ConnectorAction,
  ConnectorExecutionPreview,
  ConnectorPermission,
  RiskLevel
} from "./types";

const riskWeight: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export function checkPermissions(
  action: ConnectorAction,
  permissions: ConnectorPermission[]
) {
  const required = permissions.filter((permission) =>
    action.requiredPermissionKeys.includes(permission.permissionKey)
  );
  const knownKeys = new Set(required.map((permission) => permission.permissionKey));
  const unknownRequiredKeys = action.requiredPermissionKeys.filter((key) => !knownKeys.has(key));
  const missing = required.filter((permission) => !permission.isGranted);
  const maxRisk = required.reduce<RiskLevel>(
    (current, permission) =>
      riskWeight[permission.riskLevel] > riskWeight[current]
        ? permission.riskLevel
        : current,
    "low"
  );

  return {
    required,
    missing,
    unknownRequiredKeys,
    maxRisk,
    approvalRequired:
      missing.length > 0 ||
      unknownRequiredKeys.length > 0 ||
      riskWeight[maxRisk] >= riskWeight.high
  };
}

export function createApprovalPreviewForConnector(
  action: ConnectorAction,
  permissions: ConnectorPermission[]
): ConnectorExecutionPreview {
  const check = checkPermissions(action, permissions);

  return {
    goal: action.goal,
    connectorId: action.connectorId,
    requiredPermissions: check.required,
    readableData: inferReadableData(action),
    writableData: inferWritableData(action),
    createdData: inferCreatedData(action),
    riskLevel: check.maxRisk,
    reversible: action.type.includes("draft") || action.type.includes("read"),
    recordLocation: "integration_execution_history",
    approvalRequired: check.approvalRequired
  };
}

function inferReadableData(action: ConnectorAction) {
  if (action.type.includes("calendar")) return ["calendar.events"];
  if (action.type.includes("github")) return ["github.issues", "github.repositories"];
  if (action.type.includes("slack")) return ["slack.channels", "slack.messages"];
  return ["external.messages", "external.accounts"];
}

function inferWritableData(action: ConnectorAction) {
  if (action.type.includes("send")) return ["external.messages"];
  if (action.type.includes("event")) return ["external.events"];
  return [];
}

function inferCreatedData(action: ConnectorAction) {
  if (action.type.includes("draft")) return ["draft"];
  if (action.type.includes("sync")) return ["external index"];
  return ["execution preview"];
}
