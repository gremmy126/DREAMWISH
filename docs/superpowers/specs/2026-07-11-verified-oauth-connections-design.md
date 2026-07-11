# Verified OAuth Connections Design

## Objective

Make Integrations report only real, owner-scoped account connections. Gmail, Google Drive, Google Calendar, Slack, GitHub, Notion, and Discord must always expose a reconnect button, complete an OAuth flow, validate the returned token against the provider, and store only encrypted tokens. Firebase is configuration state, not an OAuth account connection.

## Root causes confirmed

- The local OAuth token store contains no completed connection record.
- Slack and GitHub environment tokens are treated as connected without a live provider identity check.
- Firebase project configuration is rendered as connected even though it is not an account OAuth session.
- Connector registry entries backed by `MockConnector` can leak mock account labels and sync state into the UI.
- OAuth token and session repositories are not owner scoped.
- The canonical callback path is correct locally. The observed Google callback error therefore indicates deployment configuration drift or a stale process environment.

## Connection state model

Every connector exposes one of these states:

- `not_configured`: client credentials required;
- `ready_to_connect`: OAuth client configuration exists but no verified account token exists;
- `connecting`: a short-lived owner-scoped OAuth session exists;
- `connected_verified`: token exchange and provider identity validation succeeded;
- `expired`: the token cannot be refreshed;
- `revoked`: disconnect or provider revocation was confirmed;
- `configured_unverified`: an environment token exists but has not passed a live identity check;
- `configuration_only`: Firebase or another non-OAuth service is configured.

Only `connected_verified` may use the word “connected” or contribute to the connected count. Environment-token presence and client-id presence never imply a connected account.

## Redirect URI policy

`APP_URL`/`NEXT_PUBLIC_APP_URL` plus the registry callback path is the canonical redirect URI. Provider-specific redirect variables may be retained for deployment compatibility, but startup diagnostics reject a different origin, path, query, or fragment and return the exact expected value without exposing secrets. The integration page shows the expected callback URI for console configuration.

Canonical production callbacks are:

- `https://dreamwish.co.kr/api/integrations/google/callback`
- `https://dreamwish.co.kr/api/integrations/slack/callback`
- `https://dreamwish.co.kr/api/integrations/github/callback`
- `https://dreamwish.co.kr/api/integrations/notion/callback`
- `https://dreamwish.co.kr/api/integrations/discord/callback`

## Owner-scoped OAuth flow

The connect route derives the owner from the signed session, creates a high-entropy state and PKCE verifier where supported, and stores an expiring owner-scoped OAuth session. The callback consumes the state exactly once, exchanges the code, then validates identity:

- Google: OpenID user info and granted scopes;
- Slack: `auth.test` and workspace/team identity;
- GitHub: authenticated user profile;
- Notion: authenticated bot/user and workspace identity;
- Discord: `/users/@me` identity.

Only after validation does the repository persist an owner-scoped encrypted access/refresh token and an account label. Reconnect replaces the same owner/provider/service installation while preserving history. Disconnect revokes remotely when supported, marks the local record revoked, and removes it from runtime selection.

## Google services

Google uses one provider with service-specific grants. Drive, Gmail, and Calendar have separate status records and reconnect buttons even when Google returns one refresh token. The scopes remain least privilege. Gmail read/compose and Calendar write actions stay approval-gated.

## UI behavior

The right panel always displays one primary action: Connect, Reconnect, Reauthorize, or Configure. Mock account addresses are removed. A verified account displays provider-validated email/workspace, granted scopes, expiry, last validation, last sync, and a Test connection action. Error messages use stable error codes and include the expected redirect URI when configuration drift is detected.

## Testing

Tests cover canonical redirects, stale deployment variables, owner isolation, state replay, cross-owner callbacks, provider identity success/failure, environment-token unverified state, Firebase configuration-only state, reconnect, disconnect, and UI labels.

