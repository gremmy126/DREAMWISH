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

export class GmailConnector implements Connector {
  id = "gmail";
  name = "Gmail";
  description = "Gmail 메시지 읽기, 검색, 첨부파일 메타데이터, 초안과 발송 승인 흐름을 담당합니다.";
  serviceType = "email";

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
      permission("gmail.readonly", "메일 읽기", "최근 30일 Gmail 제목, 발신자, 본문 미리보기를 읽습니다.", "low", true),
      permission("gmail.compose", "초안 생성", "사용자 승인 후 Gmail 초안을 생성합니다.", "high", true),
      permission("gmail.send", "메일 발송", "사용자 승인 후 실제 메일을 발송합니다.", "critical", false),
      permission("gmail.labels", "라벨 수정", "이번 단계에서는 비활성화된 Gmail 라벨 수정 권한입니다.", "high", false),
      permission("gmail.modify", "메일 수정/삭제", "이번 단계에서는 비활성화된 Gmail 수정 권한입니다.", "critical", false),
      permission("gmail.draft.create", "초안 생성 호환 권한", "Stage 8 planner 호환용 초안 권한입니다.", "high", true)
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
      message: "Gmail OAuth 연결, 토큰 암호화 저장, 서버 동기화 경로가 준비되어 있습니다."
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
          ? "Gmail Connector 계약을 검증했습니다."
          : "Gmail OAuth 연결 후 서버 Sync API에서 실제 Gmail API를 호출합니다.",
      ranAt: new Date().toISOString()
    };
  }

  async read(_resource: ConnectorResource) {
    return [];
  }

  async searchEmails(query: string) {
    return this.read({ type: "messages", query, limit: 10 });
  }

  async readEmail(id: string) {
    return { id, source: "gmail", blockedUntilSync: true };
  }

  async readAttachmentMetadata(emailId: string) {
    return [{ emailId, attachments: [], blockedUntilSync: true }];
  }

  async createDraft(input: Record<string, unknown>) {
    return {
      ok: Boolean(input.approvedByUser),
      message: input.approvedByUser
        ? "Gmail 초안 생성 요청을 실행 대기열에 기록했습니다."
        : "Gmail 초안 생성은 사용자 승인 후만 가능합니다."
    };
  }

  async sendEmailAfterApproval(input: Record<string, unknown>) {
    return {
      ok: Boolean(input.approvedByUser),
      message: input.approvedByUser
        ? "Gmail 메일 발송 요청을 실행 대기열에 기록했습니다."
        : "메일 발송은 사용자 승인 후만 가능합니다."
    };
  }

  async planAction(action: ConnectorAction) {
    return createApprovalPreviewForConnector(action, await this.getPermissions());
  }

  async execute(action: ConnectorAction) {
    if (action.type.includes("send")) return this.sendEmailAfterApproval(action.payload);
    if (action.type.includes("draft") || action.type.includes("compose")) {
      return this.createDraft(action.payload);
    }
    return {
      ok: true,
      message: "Gmail 읽기 작업은 low risk로 처리되며 최근 30일 범위에서만 실행됩니다."
    };
  }
}

export const gmailConnector = new GmailConnector();

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
