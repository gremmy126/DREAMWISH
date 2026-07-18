# 사용자 소유 OAuth 연결 가이드

DREAMWISH의 업무 연동은 각 사용자가 공급자 개발자 콘솔에서 만든 앱을 사용합니다. Client ID와 Client Secret은 연동 화면에서만 등록하며, Client Secret과 발급된 토큰은 서버에서 소유자별로 암호화됩니다. 저장한 Secret은 화면·API 응답·로그에 다시 표시되지 않으며 Railway 변수로 등록하지 않습니다.

## 공통 설정

1. Railway의 `APP_URL`을 실제 HTTPS 공개 주소로 설정하고 `INTEGRATION_TOKEN_ENCRYPTION_KEY`와 `OAUTH_TOKEN_ENCRYPTION_KEY`에 환경별로 서로 다른 32바이트 이상의 임의 값을 넣습니다.
2. DREAMWISH의 **연동 > 앱 연결 설정**에서 표시되는 전체 Redirect URI를 복사합니다. 아래 경로 앞의 호스트는 `APP_URL`이며, 개발자 콘솔과 한 글자도 다르면 안 됩니다.
3. 공급자 앱에서 발급한 Client ID와 Client Secret을 DREAMWISH에 저장한 뒤 연결을 눌러 동의 화면을 완료합니다.
4. Scope가 바뀌거나 앱 설정·Secret을 교체하면 기존 연결을 끊고 재연결합니다. 갱신 토큰이 폐기되거나 공급자가 권한을 회수한 경우에도 상태가 `재연결 필요`로 바뀝니다.

사용자 OAuth Client 값은 Railway에 넣지 않습니다. `.env.example`의 공급자별 Client 변수는 이전 플랫폼 공용 연결에서 마이그레이션할 때만 쓰는 호환용 값입니다. Kakao·Naver 회원 로그인은 업무 연동과 별개의 플랫폼 인증이므로 운영자가 Railway에 계속 설정합니다.

## 공급자별 설정

### Google

- [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)에서 **Web application** OAuth Client를 만들고 OAuth 동의 화면을 구성합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/google/callback`
- 입력값: Client ID, Client Secret.
- Gmail, Sheets, Calendar, Drive, YouTube 중 사용할 API를 프로젝트에서 활성화합니다. DREAMWISH는 선택 앱에 필요한 Scope만 요청하며, 백그라운드 자동화를 위해 offline access와 PKCE를 사용합니다.
- Google이 갱신 토큰을 반환하면 만료 전에 자동 갱신합니다. `invalid_grant`, 동의 철회, 테스트 사용자 만료 또는 Client 교체가 발생하면 연결을 끊고 재연결합니다.

### Slack

- [Slack API Apps](https://api.slack.com/apps)에서 새 Slack App을 만들고 **OAuth & Permissions**의 Redirect URLs에 콜백을 추가합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/slack/callback`
- 입력값: Client ID, Client Secret.
- Bot Token Scopes에서 채널·대화 읽기, 메시지 작성, 사용자·팀 조회 권한을 확인한 뒤 워크스페이스에 설치합니다.
- 기본 장기 토큰과 선택적 Token Rotation을 모두 처리합니다. Rotation을 켜면 공급자가 반환한 새 access/refresh token 쌍을 암호화해 교체합니다. 앱 제거·사용자 비활성화·Scope 변경 시 재연결합니다.

### GitHub

- [GitHub Developer settings](https://github.com/settings/developers)의 **OAuth Apps**에서 새 OAuth App을 만듭니다. OAuth App은 Authorization callback URL 하나만 사용할 수 있습니다.
- Redirect URI: `https://<APP_URL>/api/integrations/github/callback`
- 입력값: Client ID, Client Secret.
- DREAMWISH는 프로필·이메일과 저장소/Workflow 작업 Scope를 요청합니다. 조직의 OAuth App 제한 또는 SAML SSO 정책이 있으면 조직 승인도 필요합니다.
- 일반 OAuth App 토큰은 만료 시각 없이 발급되므로 자동 refresh에 의존하지 않습니다. 토큰 폐기, 조직 정책 변경, Client Secret 교체 시 재연결합니다.

### Notion

- [Notion Integrations](https://www.notion.so/my-integrations)의 Creator dashboard에서 OAuth를 사용하는 **Public connection**을 만들고 설치 범위와 Redirect URI를 등록합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/notion/callback`
- 입력값: Client ID, Client Secret.
- 동의 화면에서 자동화가 접근할 페이지를 선택합니다. 선택하지 않았거나 나중에 공유하지 않은 페이지는 읽거나 수정할 수 없습니다.
- Notion이 반환하는 회전형 refresh token을 보존하며 갱신 시 새 토큰 쌍으로 원자적으로 교체합니다. 페이지 권한 또는 연결이 해제되면 페이지를 다시 공유하거나 재연결합니다.

### Discord

- [Discord Developer Portal](https://discord.com/developers/applications)에서 Application을 만들고 OAuth2 Redirects에 콜백을 등록합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/discord/callback`
- 입력값: Client ID, Client Secret. 계정 확인 OAuth는 PKCE와 identity/email/guild 동의를 사용하며 refresh token을 갱신합니다.
- 채널 메시지·역할·채널 작업은 OAuth 사용자 토큰이 아니라 Bot 권한이 필요합니다. Portal의 Bot을 서버에 초대하고 DREAMWISH의 직접 Credential 방식에 Bot Token과 대상 서버/채널 ID를 별도로 등록합니다.
- Bot 재생성, 서버 추방 또는 권한 변경 시 Bot Credential을 다시 검증합니다. OAuth 계정 연결 오류는 연결을 끊고 재연결합니다.

### Microsoft

- [Microsoft Entra app registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)에서 Web 애플리케이션을 등록하고 Authentication에 Web redirect URI를 추가합니다. 필요하면 지원 계정 유형을 조직 정책에 맞게 선택합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/microsoft/callback`
- 입력값: Application (client) ID, Client Secret의 **값**. Secret ID가 아닙니다.
- Outlook은 Mail/Calendar, Teams는 메시지·온라인 회의, OneDrive는 Files 권한을 요청합니다. 관리자 동의가 필요한 테넌트에서는 관리자가 승인해야 합니다.
- `offline_access`와 PKCE를 사용해 토큰을 갱신합니다. Secret 만료, 관리자 동의 철회, 테넌트 정책 변경 시 새 Secret을 저장하고 재연결합니다.

### Dropbox

- [Dropbox App Console](https://www.dropbox.com/developers/apps)에서 Scoped access 앱을 만들고 App folder 또는 Full Dropbox 접근 범위를 의도에 맞게 선택합니다.
- Redirect URI: `https://<APP_URL>/api/integrations/dropbox/callback`
- 입력값: App key(Client ID), App secret(Client Secret).
- Permissions에서 계정 조회, 파일 메타데이터·내용 읽기/쓰기, 공유 쓰기 Scope를 활성화합니다. Scope 변경 후에는 다시 동의해야 합니다.
- offline access와 PKCE를 사용하며 짧은 access token을 refresh token으로 갱신합니다. 앱 비활성화·토큰 폐기·Scope 변경 시 재연결합니다.

## 장애 복구와 보안 확인

- `연결 필요`: 해당 Action에서 사용할 계정이나 검증된 Credential을 선택합니다.
- `Scope 부족`: 공급자 앱의 권한을 추가한 다음 기존 동의를 끊고 재연결합니다.
- `인증 실패` 또는 `재연결 필요`: Client 설정이 현재 버전과 같은지 확인하고 연결을 새로 만듭니다.
- Secret을 잃어버렸다면 공급자 콘솔에서 새 Secret을 발급하고 DREAMWISH 설정을 교체합니다. 이전 Secret은 복구하거나 화면에서 조회할 수 없습니다.
- 문제 보고에 Client Secret, access token, refresh token, API key, 전체 공급자 응답 본문을 첨부하지 않습니다. 연결 ID와 안전한 오류 코드만 공유합니다.
