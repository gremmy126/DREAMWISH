import type { ConnectableOAuthProviderId } from "./oauth.types";

export type VerifiedProviderIdentity = {
  providerAccountId: string;
  accountName: string | null;
  accountEmail: string | null;
  accountAvatarUrl: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
};

export type ProviderVerificationResult =
  | { ok: true; identity: VerifiedProviderIdentity }
  | { ok: false; error: string };

export async function verifyProviderAccessToken(input: {
  provider: ConnectableOAuthProviderId;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<ProviderVerificationResult> {
  const fetchImpl = input.fetchImpl || fetch;
  const endpoint = endpointFor(input.provider);
  let response: Response;

  try {
    response = await fetchImpl(endpoint, requestFor(input.provider, input.accessToken));
  } catch {
    return { ok: false, error: `${providerLabel(input.provider)} account verification failed.` };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      error: `${providerLabel(input.provider)} account verification failed (${response.status}).`
    };
  }

  const data = asRecord(payload);
  if (input.provider === "slack" && data.ok === false) {
    const reason = stringValue(data.error) || "unknown_error";
    return { ok: false, error: `Slack account verification failed: ${reason}.` };
  }

  const identity = normalizeIdentity(input.provider, data);
  if (!identity.providerAccountId) {
    return {
      ok: false,
      error: `${providerLabel(input.provider)} account verification returned no account identity.`
    };
  }
  return { ok: true, identity };
}

function endpointFor(provider: ConnectableOAuthProviderId) {
  if (provider === "google") return "https://openidconnect.googleapis.com/v1/userinfo";
  if (provider === "slack") return "https://slack.com/api/auth.test";
  if (provider === "github") return "https://api.github.com/user";
  if (provider === "notion") return "https://api.notion.com/v1/users/me";
  return "https://discord.com/api/users/@me";
}

function requestFor(provider: ConnectableOAuthProviderId, accessToken: string): RequestInit {
  return {
    method: provider === "slack" ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(provider === "notion" ? { "Notion-Version": "2026-03-11" } : {}),
      ...(provider === "github" ? { "X-GitHub-Api-Version": "2022-11-28" } : {})
    }
  };
}

function normalizeIdentity(
  provider: ConnectableOAuthProviderId,
  data: Record<string, unknown>
): VerifiedProviderIdentity {
  if (provider === "google") {
    return identity({
      id: stringValue(data.sub),
      name: stringValue(data.name),
      email: stringValue(data.email),
      avatar: stringValue(data.picture)
    });
  }
  if (provider === "slack") {
    return identity({
      id: stringValue(data.user_id) || stringValue(data.team_id),
      name: stringValue(data.user),
      workspaceId: stringValue(data.team_id),
      workspaceName: stringValue(data.team)
    });
  }
  if (provider === "github") {
    return identity({
      id: stringValue(data.id),
      name: stringValue(data.name) || stringValue(data.login),
      email: stringValue(data.email),
      avatar: stringValue(data.avatar_url)
    });
  }
  if (provider === "notion") {
    const bot = asRecord(data.bot);
    const owner = asRecord(bot.owner);
    const user = asRecord(owner.user);
    const person = asRecord(user.person);
    return identity({
      id: stringValue(data.id),
      name: stringValue(data.name),
      email: stringValue(person.email),
      avatar: stringValue(data.avatar_url),
      workspaceName: stringValue(bot.workspace_name)
    });
  }

  const id = stringValue(data.id);
  const avatarHash = stringValue(data.avatar);
  return identity({
    id,
    name: stringValue(data.global_name) || stringValue(data.username),
    email: stringValue(data.email),
    avatar: id && avatarHash ? `https://cdn.discordapp.com/avatars/${id}/${avatarHash}.png` : null
  });
}

function identity(input: {
  id: string | null;
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
}): VerifiedProviderIdentity {
  return {
    providerAccountId: input.id || "",
    accountName: input.name || null,
    accountEmail: input.email || null,
    accountAvatarUrl: input.avatar || null,
    workspaceId: input.workspaceId || null,
    workspaceName: input.workspaceName || null
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function providerLabel(provider: ConnectableOAuthProviderId) {
  return provider === "github" ? "GitHub" : `${provider[0].toUpperCase()}${provider.slice(1)}`;
}
