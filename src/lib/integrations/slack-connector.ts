import { createApprovalPreviewForConnector } from "./permission";
import type {
  Connector,
  ConnectorAction,
  ConnectorPermission,
  ConnectorResource,
  ConnectorSyncResult,
  Integration,
  SyncOptions
} from "./types";

export class SlackConnector implements Connector {
  id = "slack";
  name = "Slack";
  description = "워크스페이스, 채널 목록, 메시지 검색, 승인 후 메시지 전송을 담당합니다.";
  serviceType = "message";

  async getStatus(): Promise<Integration> {
    const now = new Date().toISOString();
    return {
      id: this.id,
      serviceName: this.name,
      serviceType: this.serviceType,
      description: this.description,
      status: "not_connected",
      isEnabled: true,
      isMock: false,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: null,
      connectedAccount: null,
      syncEnabled: false
    };
  }

  async getPermissions() {
    return makePermissions(this.id, [
      permission("channels.read", "채널 목록 읽기", "Slack 채널 목록을 읽습니다.", "low", true),
      permission("channels.history", "채널 메시지 읽기", "선택된 채널 메시지를 검색합니다.", "low", true),
      permission("users.read", "사용자 읽기", "Slack 사용자 이메일 매칭 후보를 만듭니다.", "low", true),
      permission("chat.write", "메시지 전송", "사용자 승인 후 Slack 메시지를 전송합니다.", "high", false),
      permission("files.read", "파일 읽기", "이번 단계에서는 비활성화된 Slack 파일 다운로드 권한입니다.", "high", false),
      permission("slack.channels.read", "채널 목록 읽기 호환 권한", "Stage 8 planner 호환용 채널 권한입니다.", "low", true),
      permission("slack.messages.read", "메시지 읽기 호환 권한", "Stage 8 planner 호환용 메시지 권한입니다.", "low", true),
      permission("slack.messages.write", "메시지 작성 호환 권한", "Stage 8 planner 호환용 쓰기 권한입니다.", "high", false)
    ]);
  }

  async requestPermission(permissionKeys: string[]) {
    const permissions = await this.getPermissions();
    return permissions.map((item) => ({
      ...item,
      isGranted: item.isGranted || permissionKeys.includes(item.permissionKey)
    }));
  }

  async testConnection() {
    return {
      ok: true,
      message: "Slack OAuth 연결, 채널 읽기, 메시지 검색, 승인 후 전송 구조가 준비되어 있습니다."
    };
  }

  async sync(options: SyncOptions): Promise<ConnectorSyncResult> {
    return {
      connectorId: this.id,
      status: options.type === "mock" ? "success" : "blocked",
      readCount: options.type === "mock" ? options.limit || 0 : 0,
      normalizedCount: options.type === "mock" ? options.limit || 0 : 0,
      historyId: `sync_${this.id}_${Date.now()}`,
      message:
        options.type === "mock"
          ? "Slack Connector 계약을 검증했습니다."
          : "Slack OAuth 연결 후 서버 Sync API에서 실제 Slack API를 호출합니다.",
      ranAt: new Date().toISOString()
    };
  }

  async read(_resource: ConnectorResource) {
    return [];
  }

  async listChannels() {
    return this.read({ type: "messages", limit: 20 });
  }

  async searchMessages(query: string) {
    return this.read({ type: "messages", query, limit: 10 });
  }

  async readChannelMessages(channelId: string) {
    return [{ channelId, messages: [], blockedUntilSync: true }];
  }

  async createMessagePreview(payload: Record<string, unknown>) {
    return { ...payload, approvalRequired: true, riskLevel: "high" };
  }

  async sendMessageAfterApproval(input: Record<string, unknown>) {
    return {
      ok: Boolean(input.approvedByUser),
      message: input.approvedByUser
        ? "Slack 메시지 전송 요청을 실행 대기열에 기록했습니다."
        : "Slack 메시지 전송은 사용자 승인 후만 가능합니다."
    };
  }

  async planAction(action: ConnectorAction) {
    return createApprovalPreviewForConnector(action, await this.getPermissions());
  }

  async execute(action: ConnectorAction) {
    if (action.type.includes("send") || action.type.includes("write")) {
      return this.sendMessageAfterApproval(action.payload);
    }
    return {
      ok: true,
      message: "Slack 읽기 작업은 low risk로 처리되며 대량 수집 없이 실행됩니다."
    };
  }
}

export const slackConnector = new SlackConnector();

function makePermissions(
  integrationId: string,
  permissions: Array<Omit<ConnectorPermission, "id" | "integrationId" | "createdAt" | "updatedAt">>
) {
  const now = new Date().toISOString();
  return permissions.map((item) => ({
    ...item,
    id: `${integrationId}:${item.permissionKey}`,
    integrationId,
    createdAt: now,
    updatedAt: now
  }));
}

function permission(
  permissionKey: string,
  permissionName: string,
  description: string,
  riskLevel: ConnectorPermission["riskLevel"],
  isGranted: boolean
) {
  return { permissionKey, permissionName, description, riskLevel, isGranted };
}
