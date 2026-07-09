import { createApprovalPreviewForConnector } from "@/src/lib/integrations/permission";
import { connectorRegistry } from "@/src/lib/integrations/registry";
import type { ConnectorAction } from "@/src/lib/integrations/types";

export async function planConnectorAction(command: string) {
  const connectorId = inferConnectorId(command);
  const connector = connectorRegistry.get(connectorId);
  const action: ConnectorAction = {
    type: inferActionType(command),
    connectorId,
    goal: command,
    requiredPermissionKeys: inferPermissionKeys(connectorId, command),
    payload: { command }
  };
  const permissions = await connector.getPermissions();

  return {
    connector: await connector.getStatus(),
    action,
    preview: createApprovalPreviewForConnector(action, permissions)
  };
}

function inferConnectorId(command: string) {
  if (/slack/iu.test(command)) return "slack";
  if (/calendar|캘린더|일정/iu.test(command)) return "calendar";
  if (/github|이슈|repo|pr/iu.test(command)) return "github";
  if (/notion/iu.test(command)) return "notion";
  if (/파일|local/iu.test(command)) return "local-files";
  if (/webhook/iu.test(command)) return "webhook";
  return "gmail";
}

function inferActionType(command: string) {
  if (/초안|draft/iu.test(command)) return "draft_email";
  if (/동기화|sync/iu.test(command)) return "mock_sync";
  if (/상태|status/iu.test(command)) return "status_check";
  return "capability_check";
}

function inferPermissionKeys(connectorId: string, command: string) {
  if (connectorId === "gmail" && /초안|draft/iu.test(command)) return ["gmail.draft.create"];
  if (connectorId === "gmail") return ["gmail.read"];
  if (connectorId === "calendar") return ["calendar.read"];
  if (connectorId === "slack") return ["slack.messages.read"];
  if (connectorId === "github") return ["github.repo.read"];
  if (connectorId === "notion") return ["notion.page.read"];
  if (connectorId === "local-files") return ["files.read"];
  return ["webhook.receive"];
}
