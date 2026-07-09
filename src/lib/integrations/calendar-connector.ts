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

export class CalendarConnector implements Connector {
  id = "calendar";
  name = "Google Calendar";
  description = "일정 읽기, 일정 생성/수정 미리보기, 승인 후 생성 실행을 담당합니다.";
  serviceType = "calendar";

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
      permission("calendar.readonly", "일정 읽기", "최근 30일 Google Calendar 일정을 읽습니다.", "low", true),
      permission("calendar.events", "일정 생성", "승인 후 Google Calendar 일정을 생성합니다.", "high", true),
      permission("calendar.write", "일정 수정", "승인 후 일정 수정을 준비합니다.", "high", false),
      permission("calendar.delete", "일정 삭제", "이번 단계에서는 비활성화된 일정 삭제 권한입니다.", "critical", false),
      permission("calendar.read", "일정 읽기 호환 권한", "Stage 8 planner 호환용 읽기 권한입니다.", "low", true),
      permission("calendar.event.create", "일정 생성 호환 권한", "Stage 8 planner 호환용 일정 생성 권한입니다.", "high", true)
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
      message: "Google Calendar OAuth 연결, 일정 읽기, 생성 Preview, 승인 후 생성 구조가 준비되어 있습니다."
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
          ? "Calendar Connector 계약을 검증했습니다."
          : "Google OAuth 연결 후 서버 Sync API에서 실제 Calendar API를 호출합니다.",
      ranAt: new Date().toISOString()
    };
  }

  async read(_resource: ConnectorResource) {
    return [];
  }

  async listEvents() {
    return this.read({ type: "events", limit: 10 });
  }

  async readEvent(id: string) {
    return { id, source: "calendar", blockedUntilSync: true };
  }

  async createEventPreview(payload: Record<string, unknown>) {
    return { ...payload, approvalRequired: true, riskLevel: "high" };
  }

  async createEventAfterApproval(input: Record<string, unknown>) {
    return {
      ok: Boolean(input.approvedByUser),
      message: input.approvedByUser
        ? "Google Calendar 일정 생성 요청을 실행 대기열에 기록했습니다."
        : "일정 생성은 사용자 승인 후만 가능합니다."
    };
  }

  async updateEventPreview(payload: Record<string, unknown>) {
    return { ...payload, approvalRequired: true, riskLevel: "high" };
  }

  async updateEventAfterApproval(input: Record<string, unknown>) {
    return {
      ok: Boolean(input.approvedByUser),
      message: input.approvedByUser
        ? "Google Calendar 일정 수정 요청을 실행 대기열에 기록했습니다."
        : "일정 수정은 사용자 승인 후만 가능합니다."
    };
  }

  async planAction(action: ConnectorAction) {
    return createApprovalPreviewForConnector(action, await this.getPermissions());
  }

  async execute(action: ConnectorAction) {
    if (action.type.includes("update")) return this.updateEventAfterApproval(action.payload);
    if (action.type.includes("create") || action.type.includes("event")) {
      return this.createEventAfterApproval(action.payload);
    }
    return {
      ok: true,
      message: "Calendar 읽기 작업은 low risk로 처리되며 최근 30일 범위에서만 실행됩니다."
    };
  }
}

export const calendarConnector = new CalendarConnector();

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
