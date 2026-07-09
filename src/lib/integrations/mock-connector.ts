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

type MockConnectorOptions = {
  id: string;
  name: string;
  serviceType: string;
  description: string;
  permissions: Array<Omit<ConnectorPermission, "id" | "integrationId" | "createdAt" | "updatedAt">>;
};

export class MockConnector implements Connector {
  id: string;
  name: string;
  description: string;
  serviceType: string;
  private permissionSeed: MockConnectorOptions["permissions"];

  constructor(options: MockConnectorOptions) {
    this.id = options.id;
    this.name = options.name;
    this.serviceType = options.serviceType;
    this.description = options.description;
    this.permissionSeed = options.permissions;
  }

  async getStatus(): Promise<Integration> {
    const now = new Date().toISOString();
    return {
      id: this.id,
      serviceName: this.name,
      serviceType: this.serviceType,
      description: this.description,
      status: "mock_mode",
      isEnabled: true,
      isMock: true,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
      connectedAccount: `mock-${this.id}@dreamwish.local`,
      syncEnabled: true
    };
  }

  async getPermissions(): Promise<ConnectorPermission[]> {
    const now = new Date().toISOString();
    return this.permissionSeed.map((permission) => ({
      ...permission,
      id: `${this.id}:${permission.permissionKey}`,
      integrationId: this.id,
      createdAt: now,
      updatedAt: now
    }));
  }

  async requestPermission(permissionKeys: string[]): Promise<ConnectorPermission[]> {
    const permissions = await this.getPermissions();
    return permissions.map((permission) => ({
      ...permission,
      isGranted:
        permission.isGranted || permissionKeys.includes(permission.permissionKey)
    }));
  }

  async testConnection() {
    return {
      ok: true,
      message: `${this.name} Mock Connector가 응답했습니다. 실제 외부 API는 호출하지 않았습니다.`
    };
  }

  async sync(options: SyncOptions): Promise<ConnectorSyncResult> {
    const readCount = options.limit || 3;
    return {
      connectorId: this.id,
      status: "success",
      readCount,
      normalizedCount: readCount,
      historyId: `sync_${this.id}_${Date.now()}`,
      message: "Mock data를 읽고 내부 External Index로 정규화했습니다.",
      ranAt: new Date().toISOString()
    };
  }

  async read(resource: ConnectorResource): Promise<unknown[]> {
    const limit = resource.limit || 3;
    return Array.from({ length: limit }, (_, index) => ({
      id: `${this.id}_${resource.type}_${index + 1}`,
      source: this.id,
      type: resource.type,
      title: `${this.name} mock ${resource.type} ${index + 1}`
    }));
  }

  async planAction(action: ConnectorAction) {
    return createApprovalPreviewForConnector(action, await this.getPermissions());
  }

  async execute() {
    return {
      ok: false,
      message: "승인 Flow와 실행 기록 연결 전에는 Connector가 직접 실행되지 않습니다."
    };
  }
}
