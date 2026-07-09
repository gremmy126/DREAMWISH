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
  if (/slack|슬랙/iu.test(command)) return "slack";
  if (/calendar|캘린더|일정|예약|予定|カレンダー/iu.test(command)) return "calendar";
  if (/github|깃허브|repo|repository|issue|pr|pull request/iu.test(command)) return "github";
  if (/notion|노션/iu.test(command)) return "notion";
  if (/firebase|파이어베이스|firestore|auth|hosting/iu.test(command)) return "firebase";
  if (/파일|local|file/iu.test(command)) return "local-files";
  if (/webhook/iu.test(command)) return "webhook";
  return "gmail";
}

function inferActionType(command: string) {
  if (/draft|초안|下書き/iu.test(command)) return "draft_email";
  if (/send|보내|전송|送信/iu.test(command)) return "send_message";
  if (/create|만들|생성|作成/iu.test(command)) return "create";
  if (/update|수정|편집|変更|編集/iu.test(command)) return "update";
  if (/delete|삭제|削除/iu.test(command)) return "delete";
  if (/sync|동기화|同期/iu.test(command)) return "sync";
  if (/status|상태|状態/iu.test(command)) return "status_check";
  return "capability_check";
}

function inferPermissionKeys(connectorId: string, command: string) {
  if (connectorId === "gmail" && /draft|초안|下書き/iu.test(command)) return ["gmail.draft.create"];
  if (connectorId === "gmail" && /send|보내|전송/iu.test(command)) return ["gmail.send"];
  if (connectorId === "gmail") return ["gmail.readonly"];
  if (connectorId === "calendar" && /create|만들|생성|作成/iu.test(command)) return ["calendar.events"];
  if (connectorId === "calendar") return ["calendar.readonly"];
  if (connectorId === "slack" && /send|write|보내|전송/iu.test(command)) return ["chat.write"];
  if (connectorId === "slack") return ["channels.read", "channels.history"];
  if (connectorId === "github" && /issue|write|create|만들|생성/iu.test(command)) return ["github.issue.write"];
  if (connectorId === "github") return ["github.repo.read"];
  if (connectorId === "notion" && /create|만들|생성|作成/iu.test(command)) return ["notion.page.create"];
  if (connectorId === "notion") return ["notion.page.read"];
  if (connectorId === "firebase") return ["firebase.config.read"];
  if (connectorId === "local-files") return ["files.read"];
  return ["webhook.receive"];
}
