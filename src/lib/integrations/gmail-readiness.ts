import {
  getActiveAccessToken,
  getOAuthConnectionStatus
} from "../oauth/token.service";

export type GmailSyncBlockReason =
  | "reconnect_required"
  | "missing_read_scope"
  | "token_unavailable";

export type GmailSyncReadiness = {
  status: Awaited<ReturnType<typeof getOAuthConnectionStatus>>;
  syncReady: boolean;
  syncBlockReason: GmailSyncBlockReason | null;
};

export function hasGmailReadScope(scope: readonly string[]) {
  return scope.some(
    (item) =>
      item.includes("gmail.readonly") ||
      item.includes("gmail.modify") ||
      item.includes("mail.google.com")
  );
}

export async function getGmailSyncReadiness(
  ownerId: string
): Promise<GmailSyncReadiness> {
  let status = await getOAuthConnectionStatus(ownerId, "google", "gmail");

  if (!["connected", "expired"].includes(status.connectionState)) {
    return {
      status,
      syncReady: false,
      syncBlockReason: "reconnect_required"
    };
  }

  if (!hasGmailReadScope(status.scope)) {
    return {
      status,
      syncReady: false,
      syncBlockReason: "missing_read_scope"
    };
  }

  try {
    const token = await getActiveAccessToken(ownerId, "google", "gmail");
    status = await getOAuthConnectionStatus(ownerId, "google", "gmail");
    return token
      ? { status, syncReady: true, syncBlockReason: null }
      : { status, syncReady: false, syncBlockReason: "token_unavailable" };
  } catch {
    return {
      status,
      syncReady: false,
      syncBlockReason: "token_unavailable"
    };
  }
}
