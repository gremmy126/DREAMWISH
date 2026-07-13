# Verified Connections and Durable Files Design

**Date:** 2026-07-14
**Status:** Approved for implementation

## Goal

DREAMWISH의 AI Chat 추천 연결, Memory 연결 추천, Integrations, Automation 연결 관리가 하나의 검증된 연결 상태를 사용하게 한다. 앱별 인증 방식에 맞는 키만 입력받고 실제 제공자 API 검증에 성공한 뒤에만 암호화해 저장한다. Files와 AI Chat 첨부 파일은 원본을 사용자별로 보관하여 다운로드, 실제 폴더 이동, 형식별 필터링을 지원한다.

## Scope

- AI Chat 추천 연결의 실제 수락, 연결 상태 표시, 연결 해제
- Memory의 Connection Recommendation 실제 연결 상태 표시와 연결 해제
- Integrations의 앱 사전 선택, OAuth 연결, 키 기반 연결, 연결 해제
- Automation의 모든 등록 앱 인증 방식 및 입력 필드 점검
- Gmail과 다른 OAuth 앱에서 잘못 노출되는 빠른 토큰 입력 제거
- 앱별 실제 API 검증 성공 후 자격 증명 암호화 저장
- 파일 페이지와 AI Chat 첨부 파일의 원본 저장 및 인증된 다운로드
- 실제 폴더 생성과 파일 이동, PDF·Word·Excel·이미지 필터
- 사이드바 업그레이드 버튼 위치 보장
- 사업자 주소의 `학장로`를 `덕상로`로 수정

## Non-goals

- 사용자가 제공한 앱 키를 DREAMWISH가 대신 발급하지 않는다.
- OAuth 앱에 임의 API Key 또는 빠른 토큰 입력을 허용하지 않는다.
- 검증되지 않은 키를 `연결됨`으로 표시하지 않는다.
- 기존 원본 바이트가 없는 레거시 파일 레코드에 가짜 다운로드를 제공하지 않는다.
- 이번 범위에서 파일 공유 링크나 외부 공개 다운로드를 만들지 않는다.

## Architecture

### 1. Unified verified connection read model

화면별 로컬 상태 대신 서버의 `VerifiedConnectionState`를 단일 진실 공급원으로 사용한다.

```ts
type VerifiedConnectionState = {
  connectorId: string;
  authMode: "oauth" | "api_key" | "token" | "multi_field" | "none";
  supportedAuthModes: Array<"oauth" | "api_key" | "token" | "multi_field">;
  status: "not_connected" | "connected" | "needs_reconnect";
  accountLabel: string | null;
  verifiedAt: string | null;
  canConnect: boolean;
  canDisconnect: boolean;
};
```

- OAuth 상태는 기존 owner-scoped OAuth token repository에서 읽는다.
- 키 기반 상태는 확장된 automation credential repository에서 읽는다.
- `connected`는 provider identity endpoint 검증이 성공하고 `verifiedAt`이 존재할 때만 반환한다.
- integration sync setting의 `enabled` 값만으로는 연결됨이 아니다.
- API 응답과 클라이언트 상태에 키 원문, 암호문, IV, 인증 태그를 포함하지 않는다.

### 2. Recommendation acceptance flow

앱 또는 웹사이트 추천의 `수락`은 더 이상 sync setting을 곧바로 활성화하지 않는다.

1. 추천 카드가 `/api/integrations/status`의 검증 상태를 확인한다.
2. 이미 연결된 앱이면 owner-scoped sync setting을 활성화하고 카드가 `연결 해제`로 바뀐다.
3. 미연결 앱이면 `dreamwish:navigate` 이벤트로 Integrations를 열고 connector id를 함께 전달한다.
4. Integrations는 해당 앱을 선택하고 OAuth 버튼 또는 정확한 키 필드를 표시한다.
5. 검증 성공 후 상태를 다시 불러오고 AI Chat과 Memory 카드가 `연결 해제`로 바뀐다.
6. 연결 해제는 OAuth token revoke/delete 또는 credential delete를 수행하고 sync setting도 비활성화한다.

문서 추천은 기존 Markdown 관계 수락 작업을 수행한 뒤 해당 source-target 관계를 수락 상태로 표시한다. 이미 수락된 관계는 중복 링크를 추가하지 않고 `연결 해제` 또는 이미 연결됨 상태를 표시한다. 문서 연결 해제는 이번 범위에서는 기존 문서를 파괴하지 않도록 UI에서 `연결됨` 상태만 제공하고, 앱 연결 해제와 혼동하지 않게 구분한다.

### 3. Authentication mode registry

`AUTOMATION_APPS`의 정의가 입력 UI, 검증기, 저장 스키마의 공통 계약이 된다. Gmail처럼 OAuth만 허용하는 앱과 GitHub·Notion·Discord처럼 OAuth와 직접 발급한 자격 증명을 모두 지원하는 앱을 구분하기 위해 registry는 `supportedAuthModes`를 가진다. 복수 방식을 지원할 때 Integrations는 OAuth를 권장 방식으로 먼저 표시하고 키 연결을 대안으로 제공한다.

#### OAuth only

다음 앱은 빠른 토큰 또는 API Key 입력을 표시하지 않고 계정 연결 버튼만 표시한다.

- Gmail, Google Sheets, Google Calendar, Google Drive, YouTube: Google OAuth
- Slack: Slack OAuth v2
- Outlook, Microsoft Teams, OneDrive: Microsoft OAuth
- Dropbox: Dropbox OAuth

GitHub, Notion, Discord는 기존 OAuth 연결을 유지하면서 아래 표의 token 방식도 지원한다. 어느 방식이든 실제 identity 검증에 성공한 연결 하나만 있어도 통합 상태는 `connected`이며, UI에는 현재 사용 중인 인증 방식이 표시된다.

OAuth callback은 access token 교환 뒤 provider identity endpoint를 호출해 계정을 검증한다. 성공하지 못하면 active token으로 저장하지 않는다.

#### Key or token verification matrix

| App | Required fields | Verification request |
| --- | --- | --- |
| Notion | Integration Token | `GET https://api.notion.com/v1/users/me` |
| GitHub | Fine-grained PAT | `GET https://api.github.com/user` |
| Discord | Bot Token, Server ID, Channel ID | `GET /users/@me`, then guild/channel access check |
| Telegram | Bot Token, Chat ID | Bot API `getMe`, then `getChat` |
| Airtable | Personal Access Token | `GET https://api.airtable.com/v0/meta/whoami` |
| Trello | API Key, API Token | `GET https://api.trello.com/1/members/me` |
| Asana | Personal Access Token | `GET https://app.asana.com/api/1.0/users/me` |
| Jira | Site URL, Account Email, API Token | `GET {siteUrl}/rest/api/3/myself` with Basic auth |
| Linear | Personal API Key | GraphQL `viewer { id name email }` |
| HubSpot | Private App Access Token | `GET https://api.hubapi.com/account-info/v3/details` |
| Salesforce | Instance URL, Access Token | `GET {instanceUrl}/services/oauth2/userinfo` |
| Stripe | Restricted or Secret API Key | `GET https://api.stripe.com/v1/account` |
| Shopify | Store Domain, Admin API Access Token | `GET https://{store}/admin/api/2025-04/shop.json` |
| WordPress | Site URL, Username, Application Password | `GET {siteUrl}/wp-json/wp/v2/users/me?context=edit` |
| Facebook | Page Access Token, Page ID | Graph API `/{pageId}?fields=id,name` |
| Instagram | Access Token, Business Account ID | Graph API `/{businessAccountId}?fields=id,username` |
| X | API Key, API Secret, Access Token, Access Token Secret | OAuth 1.0a signed `GET /2/users/me` |
| LinkedIn | OAuth Access Token, Person or Organization ID | `GET https://api.linkedin.com/v2/userinfo` and id match |
| OpenAI | API Key | `GET https://api.openai.com/v1/models` |

모든 provider request는 짧은 timeout, redirect 제한, HTTPS URL validation을 사용한다. Jira, Salesforce, Shopify, WordPress처럼 사용자가 호스트를 입력하는 앱은 허용된 public HTTPS host만 사용하고 localhost, private IP, link-local address를 거부하여 SSRF를 차단한다.

### 4. Credential lifecycle

```ts
type VerifiedAutomationCredential = {
  id: string;
  ownerId: string;
  appId: string;
  label: string;
  masked: string;
  accountLabel: string | null;
  verificationStatus: "verified" | "needs_reconnect";
  verifiedAt: string;
  schemaVersion: 2;
  ciphertext: string;
  iv: string;
  authTag: string;
  createdAt: string;
  updatedAt: string;
};
```

키는 요청 처리 메모리에서 provider 검증에 사용하고, 성공 후 JSON payload 전체를 AES-256-GCM으로 암호화한다. 실패한 키는 저장하지 않는다. 기존 schema v1 credential은 `configured_unverified`로 취급하여 자동 연결됨으로 올리지 않고 재검증을 요구한다. 연결 해제 시 credential record를 삭제하고 관련 scenario credential id를 무효 상태로 표시한다.

### 5. Integrations and Automation UX

- Integrations는 navigation event의 `connectorId`를 받아 해당 카드를 자동 선택한다.
- OAuth 전용 앱은 `계정 연결`과 검증 상태, callback URI, 연결 해제만 표시한다.
- OAuth와 token을 모두 지원하는 GitHub·Notion·Discord는 `계정 연결(권장)`과 `직접 키 연결`을 분리해 표시한다.
- 키 앱은 registry의 필드 label, placeholder, secret 여부, help를 그대로 사용한다.
- Automation inspector의 `빠른 Token 추가`는 제거한다.
- OAuth 모듈에는 Integrations로 이동하는 `계정 연결` 버튼을 표시한다.
- 키 모듈에는 Connection Management로 이동하는 `키 연결` 버튼을 표시한다.
- 저장 실패 메시지는 generic `API 키를 저장하지 못했습니다` 대신 `필수 필드 누락`, `인증 실패`, `권한 부족`, `제공자 일시 오류`, `안전하지 않은 URL`로 구분한다.

## Durable file storage

### 1. Data model

```ts
type FileFolder = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type FileRecord = {
  ownerId: string;
  id: string;
  name: string;
  mimeType: string;
  size: number;
  category: "pdf" | "word" | "excel" | "image" | "other";
  source: "aichat" | "files" | "knowledge";
  textPreview: string;
  projectId: string | null;
  folderId: string | null;
  storageKey: string | null;
  sha256: string | null;
  createdAt: string;
};
```

`storageKey`는 서버 내부 필드이며 일반 목록 API에서 반환하지 않는다. 원본은 `DATA_DIR/files/{ownerHash}/{fileId}`에 저장하고 메타데이터는 owner-scoped repository에 저장한다. 운영 환경에서는 persistent volume에 연결된 `DATA_DIR`이 필수다.

### 2. Upload and download

- `POST /api/files`는 multipart form data를 받아 최대 25 MiB 원본을 저장한다.
- Files와 AI Chat은 같은 upload API를 사용하고 source만 다르게 보낸다.
- MIME type과 확장자를 함께 검사하고 저장 파일명에는 사용자 입력을 사용하지 않는다.
- SHA-256을 기록해 무결성을 확인한다.
- `GET /api/files/{fileId}/download`는 session owner와 record owner가 일치할 때만 스트리밍한다.
- 다운로드 응답은 안전하게 인코딩한 원본 이름과 `Content-Disposition: attachment`를 사용한다.
- storageKey가 없는 기존 레코드는 404 대신 `FILE_CONTENT_UNAVAILABLE` 409를 반환해 레거시 상태를 명확히 알린다.
- 다른 owner의 file id는 존재 여부를 숨기기 위해 404로 응답한다.

### 3. Folders and categories

- `GET/POST /api/files/folders`로 owner-scoped 폴더를 조회·생성한다.
- `PATCH /api/files/{fileId}`의 `folderId`로 파일을 루트 또는 소유자 폴더로 이동한다.
- 폴더 이름은 trim 후 1~80자이며 같은 owner 내 중복 이름을 허용하지 않는다.
- PDF, Word, Excel, Image 카테고리는 MIME type과 안전한 확장자 allowlist로 서버에서 계산한다.
- Files UI는 폴더 목록, 형식 필터, 파일 카드, 다운로드, 폴더 이동을 제공한다.
- 필터와 폴더 선택은 클라이언트 표시 상태이며 서버 데이터의 소유권 검증을 대체하지 않는다.

## Sidebar and business information

- `UpgradeButton compact`는 Sidebar 하단의 `StorageStatus` 바로 위에 유지한다.
- 관리자, 유료 사용자, 무료 사용자별 기존 버튼 label과 동작을 보존한다.
- 주소는 `부산 사상구 덕상로 8-37, 202동 2504호`로 수정한다.

## Error handling

- Provider 401/403은 `INVALID_CREDENTIALS` 또는 `INSUFFICIENT_SCOPE`로 정규화한다.
- Provider 429/5xx와 timeout은 `PROVIDER_UNAVAILABLE`로 정규화하고 키를 저장하지 않는다.
- 사용자 입력 URL validation 실패는 `UNSAFE_PROVIDER_URL`로 반환한다.
- 암호화 설정이 없는 production은 기존과 같이 fail closed한다.
- 파일 업로드 실패 시 메타데이터만 남지 않도록 원본 저장과 record 저장을 보상 처리한다.
- 파일 metadata 저장 실패 시 방금 생성한 원본을 제거한다.
- 다운로드 중 파일이 없거나 hash가 맞지 않으면 손상 상태를 반환하고 다른 파일을 노출하지 않는다.

## Testing

### Connection tests

- OAuth 앱에 빠른 토큰 입력이 나타나지 않는다.
- registry의 모든 앱이 정확한 auth type, required field, verifier를 갖는다.
- provider 검증 실패 시 credential repository가 변경되지 않는다.
- provider 검증 성공 시 owner-scoped encrypted credential과 verifiedAt이 저장된다.
- 다른 owner는 credential 상태를 읽거나 해제할 수 없다.
- 추천 수락은 미연결 앱에서 Integrations로 이동하며 sync setting을 먼저 활성화하지 않는다.
- 연결 성공·해제 후 AI Chat, Memory, Integrations가 동일한 상태를 표시한다.
- 레거시 unverified key는 연결됨으로 표시하지 않는다.
- 사용자 입력 provider URL의 localhost, private IP, non-HTTPS를 거부한다.

### File tests

- Files와 AI Chat multipart upload가 원본과 metadata를 저장한다.
- 목록 API가 storageKey를 노출하지 않는다.
- 다운로드는 올바른 bytes와 attachment filename을 반환한다.
- 다른 owner의 다운로드와 폴더 이동은 404다.
- legacy metadata-only record는 `FILE_CONTENT_UNAVAILABLE`이다.
- 실제 폴더 생성, 중복 이름 거부, 루트/폴더 이동이 동작한다.
- PDF, Word, Excel, Image, Other 분류가 MIME/extension 규칙대로 동작한다.
- 25 MiB 초과 파일과 허용되지 않은 위험 확장자를 거부한다.

### Regression tests

- Sidebar에서 UpgradeButton이 StorageStatus보다 앞에 있다.
- 사업자 주소가 덕상로로 표시된다.
- 기존 OAuth callback, billing, memory, chat, files owner isolation 테스트가 계속 통과한다.
- `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run build`가 통과한다.

## Rollout and compatibility

- 기존 OAuth 연결은 그대로 유지한다.
- schema v1 키 레코드는 삭제하지 않고 재검증 대상으로 표시한다.
- 기존 file metadata 레코드는 목록에 유지하고 원본 없음 안내를 표시한다.
- 새 file schema의 optional fields로 기존 JSON store를 무중단 정규화한다.
- UI 상태는 API 재조회로 갱신하며 페이지 새로고침 없이 연결·해제를 반영한다.
