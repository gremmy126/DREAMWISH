export type IntegrationStatus =
  | "not_connected"
  | "connected"
  | "needs_permission"
  | "sync_error"
  | "disabled"
  | "mock_mode";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type SyncType = "manual" | "scheduled" | "event_based" | "webhook" | "mock";

export type Integration = {
  id: string;
  serviceName: string;
  serviceType: string;
  description: string;
  status: IntegrationStatus;
  isEnabled: boolean;
  isMock: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string | null;
  connectedAccount?: string | null;
  syncEnabled?: boolean;
};

export type ExternalAccount = {
  id: string;
  integrationId: string;
  provider: string;
  accountName: string;
  accountEmail: string;
  status: IntegrationStatus;
  accessTokenEncrypted: string;
  refreshTokenEncrypted: string;
  expiresAt: string | null;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ConnectorPermission = {
  id: string;
  integrationId: string;
  permissionKey: string;
  permissionName: string;
  description: string;
  riskLevel: RiskLevel;
  isGranted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SyncJob = {
  id: string;
  integrationId: string;
  name: string;
  status: "idle" | "running" | "success" | "failed";
  syncType: SyncType;
  lastRunAt: string | null;
  nextRunAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SyncOptions = {
  type: SyncType;
  limit?: number;
};

export type ConnectorResource = {
  type: "messages" | "events" | "files" | "accounts" | "logs";
  query?: string;
  limit?: number;
};

export type ConnectorAction = {
  type: string;
  connectorId: string;
  goal: string;
  requiredPermissionKeys: string[];
  payload: Record<string, unknown>;
};

export type ConnectorExecutionPreview = {
  goal: string;
  connectorId: string;
  requiredPermissions: ConnectorPermission[];
  readableData: string[];
  writableData: string[];
  createdData: string[];
  riskLevel: RiskLevel;
  reversible: boolean;
  recordLocation: string;
  approvalRequired: boolean;
};

export type ConnectorSyncResult = {
  connectorId: string;
  status: "success" | "blocked" | "failed";
  readCount: number;
  normalizedCount: number;
  historyId: string;
  message: string;
  ranAt: string;
};

export type ManualSyncOptions = {
  days: number;
  limit: number;
};

export type ExternalIdentityMatchStatus =
  | "suggested"
  | "confirmed"
  | "rejected"
  | "auto_matched";

export type ExternalIdentityMatch = {
  id: string;
  source: "gmail" | "calendar" | "slack";
  externalId: string;
  email: string;
  candidateName: string;
  candidateType: "customer" | "contact" | "project" | "knowledge";
  confidence: number;
  status: ExternalIdentityMatchStatus;
  createdAt: string;
};

export type SyncConflict = {
  id: string;
  connectorId: string;
  externalId: string;
  reason: string;
  status: "open" | "resolved" | "ignored";
  createdAt: string;
};

export type ApprovalExecutionLink = {
  id: string;
  approvalId: string;
  connectorId: string;
  actionType: string;
  status: "pending" | "approved" | "rejected" | "executed" | "blocked";
  createdAt: string;
  updatedAt: string;
};

export interface Connector {
  id: string;
  name: string;
  description: string;
  serviceType: string;
  getStatus(): Promise<Integration>;
  getPermissions(): Promise<ConnectorPermission[]>;
  requestPermission(permissionKeys: string[]): Promise<ConnectorPermission[]>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  sync(options: SyncOptions): Promise<ConnectorSyncResult>;
  read(resource: ConnectorResource): Promise<unknown[]>;
  planAction(action: ConnectorAction): Promise<ConnectorExecutionPreview>;
  execute(action: ConnectorAction): Promise<{ ok: boolean; message: string }>;
}

export type ExternalMessage = {
  id: string;
  integrationId: string;
  externalId: string;
  source: string;
  sender: string;
  recipients: string[];
  subject: string;
  bodyPreview: string;
  bodyText: string;
  receivedAt: string;
  relatedCustomerId: string | null;
  relatedProjectId: string | null;
  createdAt: string;
};

export type ExternalEvent = {
  id: string;
  integrationId: string;
  externalId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  attendees: string[];
  location: string;
  relatedCustomerId: string | null;
  relatedProjectId: string | null;
  createdAt: string;
};

export type ExternalFile = {
  id: string;
  integrationId: string;
  externalId: string;
  fileName: string;
  mimeType: string;
  size: number;
  source: string;
  path: string;
  relatedCustomerId: string | null;
  relatedProjectId: string | null;
  createdAt: string;
};
