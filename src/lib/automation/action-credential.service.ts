import { listCredentials, revealCredential } from "./credential.repository";
import {
  getOAuthAccessTokenForConnection,
  validateConnectionForAction
} from "../oauth/oauth-connection.service";
import {
  exchangeGoogleServiceAccountToken,
  parseGoogleServiceAccountJson
} from "../integrations/google-service-account";
import type { ActionDefinition } from "./registry/action.types";
import { getAutomationApp } from "./app-registry";

export type StructuredActionCredential = {
  id: string;
  appId: string;
  accountLabel: string;
  values: Record<string, string>;
};

export async function resolveStructuredActionCredential(
  ownerId: string,
  credentialId: string,
  appId: string
): Promise<StructuredActionCredential> {
  const credentials = await listCredentials(ownerId);
  const credential = credentials.find((item) => item.id === credentialId);
  if (!credential) throw credentialError("선택한 키를 찾을 수 없습니다.", "CONNECTION_NOT_FOUND");
  if (credential.appId !== appId) throw credentialError("선택한 키를 이 앱에서 사용할 수 없습니다.", "CONNECTION_APP_MISMATCH");
  if (credential.verificationStatus !== "verified") throw credentialError("키를 다시 검증하거나 연결해 주세요.", "CREDENTIAL_INVALID");
  const raw = await revealCredential(ownerId, credentialId);
  if (!raw) throw credentialError("저장된 키를 불러올 수 없습니다.", "CREDENTIAL_INVALID");
  let values: Record<string, string>;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    values = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
  } catch {
    throw credentialError("저장된 키 형식이 올바르지 않습니다.", "CREDENTIAL_INVALID");
  }
  return {
    id: credential.id,
    appId: credential.appId,
    accountLabel: credential.accountLabel || credential.label,
    values
  };
}

export async function validateActionConnection(input: {
  ownerId: string;
  connectionId: string | null;
  appId: string;
  requiredScopes: string[];
}) {
  if (!input.connectionId) {
    const app = getAutomationApp(input.appId);
    if (input.requiredScopes.length === 0 && (!app || app.authType === "none")) {
      return { accountLabel: null, scopes: [], credentialStatus: "valid", rateLimitRemaining: null };
    }
    throw credentialError("이 Action에 사용할 연결 계정 또는 검증된 키를 선택해 주세요.", "CONNECTION_REQUIRED");
  }
  const structured = await tryResolveStructured(input.ownerId, input.connectionId, input.appId);
  if (structured) {
    return {
      accountLabel: structured.accountLabel,
      scopes: [...input.requiredScopes],
      credentialStatus: "valid",
      rateLimitRemaining: null
    };
  }
  return validateConnectionForAction(input);
}

export async function getActionAuthorization(input: {
  ownerId: string;
  connectionId: string;
  definition: ActionDefinition;
}) {
  const structured = await tryResolveStructured(input.ownerId, input.connectionId, input.definition.appId);
  if (!structured) {
    const oauth = await getOAuthAccessTokenForConnection({
      ownerId: input.ownerId,
      connectionId: input.connectionId,
      appId: input.definition.appId,
      requiredScopes: input.definition.requiredScopes
    });
    return { headers: { Authorization: `Bearer ${oauth.accessToken}` }, accountLabel: oauth.connection.accountLabel || oauth.connection.accountEmail };
  }
  const values = structured.values;
  if (input.definition.appId === "google-sheets" && values.serviceAccountJson) {
    const account = parseGoogleServiceAccountJson(values.serviceAccountJson);
    const token = await exchangeGoogleServiceAccountToken(account, ["https://www.googleapis.com/auth/spreadsheets"]);
    return { headers: { Authorization: `Bearer ${token.accessToken}` }, accountLabel: structured.accountLabel };
  }
  if (input.definition.appId === "discord" && values.botToken) {
    return { headers: { Authorization: `Bot ${values.botToken}` }, accountLabel: structured.accountLabel };
  }
  const bearer = values.integrationToken || values.personalAccessToken || values.accessToken || values.privateAppToken;
  if (bearer) return { headers: { Authorization: `Bearer ${bearer}` }, accountLabel: structured.accountLabel };
  throw credentialError("이 Action에서 사용할 수 있는 인증 값이 없습니다.", "CREDENTIAL_INVALID");
}

async function tryResolveStructured(ownerId: string, connectionId: string, appId: string) {
  const credentials = await listCredentials(ownerId);
  if (!credentials.some((item) => item.id === connectionId)) return null;
  return resolveStructuredActionCredential(ownerId, connectionId, appId);
}

function credentialError(message: string, code: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}
