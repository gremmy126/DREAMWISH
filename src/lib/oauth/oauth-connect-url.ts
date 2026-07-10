import type { ConnectableOAuthProviderId, OAuthServiceId } from "./oauth.types";

export function getIntegrationConnectPath(input: {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
}) {
  const path = `/api/integrations/${input.provider}/connect`;
  if (input.provider !== "google" || !input.service) return path;
  return `${path}?service=${encodeURIComponent(input.service)}`;
}

export function getIntegrationDisconnectPath(input: {
  provider: ConnectableOAuthProviderId;
  service?: OAuthServiceId | null;
}) {
  const path = `/api/integrations/${input.provider}/disconnect`;
  if (input.provider !== "google" || !input.service) return path;
  return `${path}?service=${encodeURIComponent(input.service)}`;
}
