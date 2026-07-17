export type IntegrationConnectionProvider =
  | "google"
  | "slack"
  | "github"
  | "notion"
  | "discord"
  | "microsoft"
  | "dropbox";

export type IntegrationConnectionStatus =
  | "connecting"
  | "connected"
  | "token_expired"
  | "refresh_failed"
  | "insufficient_scope"
  | "reconnect_required"
  | "provider_unavailable"
  | "validation_failed"
  | "connection_error"
  | "setup_required"
  | "disconnected"
  | "revoked";

export type IntegrationConnection = {
  id: string;
  ownerId: string;
  userId: string;
  appId: string;
  provider: IntegrationConnectionProvider;
  providerAccountId: string;
  providerWorkspaceId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
  tokenKeyVersion: number | null;
  expiresAt: string | null;
  grantedScopes: string[];
  status: IntegrationConnectionStatus;
  connectedAt: string | null;
  refreshedAt: string | null;
  validatedAt: string | null;
  disconnectedAt: string | null;
  revokedAt: string | null;
  disconnectActorId: string | null;
  disconnectReason: string | null;
  revokeResult: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicIntegrationConnection = Omit<
  IntegrationConnection,
  "ownerId" | "userId" | "accessTokenCiphertext" | "refreshTokenCiphertext" | "tokenKeyVersion"
> & { credentialStatus: "valid" | "expired" | "reconnect_required" | "disconnected" };

export function toPublicIntegrationConnection(connection: IntegrationConnection): PublicIntegrationConnection {
  const {
    ownerId: _ownerId,
    userId: _userId,
    accessTokenCiphertext: _accessToken,
    refreshTokenCiphertext: _refreshToken,
    tokenKeyVersion: _keyVersion,
    ...safe
  } = connection;
  return { ...safe, credentialStatus: credentialStatus(connection) };
}

export function classifyConnectionFailure(
  reason: string
): Exclude<IntegrationConnectionStatus, "disconnected" | "revoked"> {
  if (reason === "token_expired") return "token_expired";
  if (reason === "refresh_failed") return "refresh_failed";
  if (reason === "insufficient_scope") return "insufficient_scope";
  if (reason === "provider_unavailable") return "provider_unavailable";
  if (reason === "validation_failed") return "validation_failed";
  if (reason === "setup_required") return "setup_required";
  return "connection_error";
}

function credentialStatus(connection: IntegrationConnection): PublicIntegrationConnection["credentialStatus"] {
  if (connection.status === "disconnected" || connection.status === "revoked") return "disconnected";
  if (connection.status === "token_expired" || (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now())) return "expired";
  if (connection.status !== "connected") return "reconnect_required";
  return "valid";
}
