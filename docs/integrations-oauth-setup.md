# Integrations OAuth Setup

Canonical production app URL:

```text
https://dreamwish.co.kr
```

Local development URL from `package.json`:

```text
http://127.0.0.1:3100
```

If the local port changes, update `APP_URL` and the local callback URLs in each developer console to the exact port in use.

## Runtime Environment

Required Railway/server variables:

```env
APP_URL=https://dreamwish.co.kr
INTEGRATION_TOKEN_ENCRYPTION_KEY=<32+ byte random secret>
OAUTH_TOKEN_ENCRYPTION_KEY=<optional separate 32+ byte random secret>
AUTOMATION_CREDENTIAL_ENCRYPTION_KEY=<optional separate 32+ byte random secret>
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://dreamwish.co.kr/api/integrations/google/callback
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_REDIRECT_URI=https://dreamwish.co.kr/api/integrations/slack/callback
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=https://dreamwish.co.kr/api/integrations/github/callback
NOTION_CLIENT_ID=
NOTION_CLIENT_SECRET=
NOTION_REDIRECT_URI=https://dreamwish.co.kr/api/integrations/notion/callback
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://dreamwish.co.kr/api/integrations/discord/callback
```

Do not put client secrets in `NEXT_PUBLIC_*` variables. Do not store access tokens or refresh tokens in localStorage, sessionStorage, or client cookies.

User-entered automation credentials are encrypted with AES-256-GCM. The server chooses the first configured key in this order: `AUTOMATION_CREDENTIAL_ENCRYPTION_KEY`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, then `OAUTH_TOKEN_ENCRYPTION_KEY`. Production refuses to save a verified credential when all three are absent. Each record stores only the non-secret key identifier so adding a new preferred key does not make older records unreadable. `AUTH_SESSION_SECRET` is never used for credential encryption.

Client IDs, client secrets, and encryption keys belong only in Railway or another server deployment environment. End users enter only the provider-specific API key, personal token, bot token, or other field explicitly requested by the app connection form.

## Callback URLs

Register these production callback URLs:

```text
https://dreamwish.co.kr/api/integrations/slack/callback
https://dreamwish.co.kr/api/integrations/github/callback
https://dreamwish.co.kr/api/integrations/google/callback
https://dreamwish.co.kr/api/integrations/notion/callback
https://dreamwish.co.kr/api/integrations/discord/callback
```

Register these local callback URLs when testing locally:

```text
http://127.0.0.1:3100/api/integrations/slack/callback
http://127.0.0.1:3100/api/integrations/github/callback
http://127.0.0.1:3100/api/integrations/google/callback
http://127.0.0.1:3100/api/integrations/notion/callback
http://127.0.0.1:3100/api/integrations/discord/callback
```

Google Drive, Gmail, and Google Calendar share the same Google callback URL. The selected service is stored in server-side OAuth state.

## Connect URLs

The frontend must call only these first-party endpoints:

```text
GET /api/integrations/slack/connect
GET /api/integrations/github/connect
GET /api/integrations/google/connect?service=drive
GET /api/integrations/google/connect?service=gmail
GET /api/integrations/google/connect?service=calendar
GET /api/integrations/notion/connect
GET /api/integrations/discord/connect
```

The server generates provider authorization URLs, state, and PKCE values. The client does not build provider OAuth URLs.

## Provider Settings

Slack:

- App type: Slack app using OAuth V2.
- Authorization endpoint: `https://slack.com/oauth/v2/authorize`
- Token endpoint: `https://slack.com/api/oauth.v2.access`
- Bot scopes: `channels:read`, `groups:read`, `im:read`, `mpim:read`, `chat:write`, `users:read`, `team:read`
- Redirect URL: `https://dreamwish.co.kr/api/integrations/slack/callback`

GitHub:

- App type: OAuth App unless organization/repository installation control requires a GitHub App later.
- Authorization endpoint: `https://github.com/login/oauth/authorize`
- Token endpoint: `https://github.com/login/oauth/access_token`
- Default scopes: `read:user`, `user:email`
- Add `repo` or `read:org` only when the product feature actually needs it.
- Redirect URL: `https://dreamwish.co.kr/api/integrations/github/callback`

Google:

- OAuth client: one Google OAuth 2.0 Web client shared by Drive, Gmail, and Calendar.
- Authorization endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Token endpoint: `https://oauth2.googleapis.com/token`
- Required APIs: Gmail API, Google Drive API, Google Calendar API.
- OAuth consent screen: configure app name, support email, scopes, and test users before production publishing.
- Authorized redirect URI: `https://dreamwish.co.kr/api/integrations/google/callback`
- Base identity scopes: `openid`, `https://www.googleapis.com/auth/userinfo.email`, `https://www.googleapis.com/auth/userinfo.profile`
- Drive scope: `https://www.googleapis.com/auth/drive.file`
- Gmail scopes: `https://www.googleapis.com/auth/gmail.readonly`, `https://www.googleapis.com/auth/gmail.compose`
- Calendar scopes: `https://www.googleapis.com/auth/calendar.readonly`, `https://www.googleapis.com/auth/calendar.events`
- Sensitive or restricted scopes may require Google verification before production access.

Notion:

- Integration type: Public Integration OAuth.
- Authorization endpoint: `https://api.notion.com/v1/oauth/authorize`
- Token endpoint: `https://api.notion.com/v1/oauth/token`
- Redirect URL: `https://dreamwish.co.kr/api/integrations/notion/callback`
- Token exchange uses Basic auth with `NOTION_CLIENT_ID:NOTION_CLIENT_SECRET`.

Discord:

- Authorization endpoint: `https://discord.com/oauth2/authorize`
- Token endpoint: `https://discord.com/api/oauth2/token`
- Default scopes: `identify`, `email`
- Add `guilds`, `bot`, or `applications.commands` only when server or bot features are implemented.
- Redirect URL: `https://dreamwish.co.kr/api/integrations/discord/callback`

## Common Redirect URI Fixes

For `redirect_uri_mismatch`, compare the provider console value and code output character by character:

- `https://dreamwish.co.kr` must not be mixed with `http`, `www`, or `dreamwish.co`.
- Production must not use `localhost` or `127.0.0.1`.
- The path must be `/api/integrations/{provider}/callback`, not `/api/oauth/{provider}/callback`.
- Google must use `/api/integrations/google/callback` for Drive, Gmail, and Calendar.
- Remove old hardcoded authorization URLs from env files and UI components.

## Test Procedure

1. Set Railway variables from the Runtime Environment section.
2. Register production callback URLs in each developer console.
3. Enable the required Google APIs and consent screen.
4. Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
5. Open the Integration page and click each connect button.
6. Confirm the browser first hits `/api/integrations/.../connect`, then redirects to the provider consent screen.
7. Complete OAuth and confirm the app returns to `/?view=integrations&connected=<service>`.
8. Confirm no token, authorization code, client secret, or code verifier appears in URL query strings, browser storage, or logs.
