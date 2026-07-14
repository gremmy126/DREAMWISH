# Railway Bucket, 계정 저장공간, Gmail 대화 동기화 설계

## 1. 목표

DREAMWISH 운영 환경에서 Gmail 연결 직후 비즈니스 메일 대화가 비어 보이는 문제를 해결한다. Gmail은 날짜 제한 없이 최신 50개 메시지를 가져와 스레드별 대화로 표시하고, 권한 부족이나 공급자 오류를 빈 상태로 숨기지 않는다.

계정 저장공간은 10 GiB로 정의한다. 화면에는 현재 사용량, 10 GiB 한도, 소수점 둘째 자리까지의 사용률을 표시하고, 새 파일을 저장했을 때 한도를 초과하면 서버가 업로드를 거부한다. 브라우저 `localStorage`는 이 한도에 포함하지 않는다. 브라우저 저장소는 인증 표시, 언어, 동의와 화면 설정 같은 소량의 클라이언트 환경설정에만 사용한다.

## 2. 확인된 운영 환경

2026-07-14 Railway 대시보드에서 다음을 확인했다.

- 워크스페이스 플랜은 Hobby다.
- `vivacious-reflection` 프로젝트의 `DREAMWISH` 서비스가 `dreamwish.co.kr`을 제공한다.
- 같은 프로젝트의 PostgreSQL에는 5.00 GB `postgres-volume`이 연결되어 있다.
- `DREAMWISH` 애플리케이션 서비스에는 persistent volume이 연결되어 있지 않다.
- `DREAMWISH` 서비스에는 현재 유효하지 않은 Singapore region 식별자가 남아 있어 Railway가 새 배포를 차단한다고 표시한다.
- 현재 코드는 파일 원본, OAuth token record, Gmail message/thread, sync history 등 여러 JSON 저장소를 애플리케이션 파일시스템의 `DATA_DIR` 아래에 기록한다. 운영 서비스에 volume이 없으므로 이 데이터는 재배포나 컨테이너 교체 뒤 보존을 보장할 수 없다.

Railway Hobby Volume은 5 GB가 기본·최대 크기이고, Railway Storage Bucket은 Hobby에서 합산 1 TB까지 사용할 수 있다. 따라서 계정당 10 GiB 파일 한도를 일반 Volume 하나로 제공하지 않고, 파일 원본은 private S3-compatible Railway Bucket에 저장한다. 작은 JSON 운영 상태는 별도의 5 GB 애플리케이션 Volume에 저장한다.

참고:

- [Railway Volumes](https://docs.railway.com/volumes/reference)
- [Railway Storage Buckets](https://docs.railway.com/storage-buckets)
- [Railway Storage Bucket Billing](https://docs.railway.com/storage-buckets/billing)

## 3. 범위

### 포함

- DREAMWISH 서비스에 `dreamwish-data` Volume을 `/data`로 연결하고 `DATA_DIR=/data`를 적용
- production 환경에 private Railway Bucket `dreamwish-files` 생성
- DREAMWISH service region을 Railway가 현재 제공하는 Singapore 선택값으로 교정
- Bucket credential을 DREAMWISH 서비스에 reference variable로 연결
- 파일 원본 저장·조회·삭제를 Railway Bucket adapter로 전환
- 로컬 개발에서는 기존 파일시스템 adapter 유지
- 계정당 10 GiB quota 계산, 표시와 업로드 차단
- Gmail 최신 50개 동기화, 권한 readiness 판정, 오류 상태와 재시도
- Gmail thread 병합과 캐시 유지
- 관련 테스트와 운영 문서

### 제외

- 브라우저 `localStorage`에 10 GiB를 할당하거나 브라우저 자체 quota를 변경하는 기능
- Gmail 전체 메일함 백필, 실시간 webhook 또는 주기적 background worker
- Railway 플랜 업그레이드
- public bucket
- 파일 버전 관리, object lock, lifecycle rule
- 기존 배포에서 이미 유실된 파일 원본 복구

## 4. 저장공간 기준

```text
ACCOUNT_STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024
```

화면 표기는 `10.0 GB`가 아니라 이진 기준을 명확히 하기 위해 내부 계산은 10 GiB를 사용하되, 기존 UI의 사용자 친화적 표기에서는 `10.0 GB`로 표시한다.

계정 사용량은 다음 합계다.

- Bucket에 저장된 해당 owner의 파일 원본 크기
- 승인 메모리, 지식, 채팅, 비즈니스, 자동화 metadata의 직렬화 크기

브라우저 `localStorage`, OAuth access/refresh token의 암호문, 일시적인 upload reservation은 사용자에게 판매하는 파일 용량에서 제외한다. OAuth와 reservation은 운영 필수 metadata이며 전체 `/data` Volume 수준에서 별도로 감시한다.

업로드 전에 현재 사용량과 새 파일 크기를 합산한다. 10 GiB를 초과하면 원본을 Bucket에 쓰기 전에 `STORAGE_QUOTA_EXCEEDED`로 거부한다. 현재 Hobby 단일 replica에서는 owner-scoped mutex로 같은 계정의 동시 업로드를 직렬화한다. 향후 replica를 늘릴 때는 PostgreSQL transaction 기반 reservation으로 교체한다.

## 5. Railway 리소스 설계

### 5.1 애플리케이션 Volume

- 이름: `dreamwish-data`
- 연결 서비스: `DREAMWISH`
- mount path: `/data`
- service variable: `DATA_DIR=/data`
- 용도: OAuth record, Gmail message/thread, sync history와 아직 PostgreSQL로 이전되지 않은 JSON metadata

이 Volume은 파일 원본 10 GiB를 담는 용도가 아니다. metadata 지속성과 현재 저장소 계약을 보존하기 위한 전환 장치다.

### 5.2 Railway Bucket

- 표시 이름: `dreamwish-files`
- 환경: `production`
- region: DREAMWISH와 가까운 Singapore 계열 region
- 접근: private only
- object key: `owners/<ownerHash>/files/<fileId>`

Railway가 제공하는 `BUCKET`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, `ENDPOINT`를 DREAMWISH 서비스에 reference variable로 주입한다. 애플리케이션은 다음 server-only 이름으로 읽는다.

- `STORAGE_BUCKET_NAME`
- `STORAGE_BUCKET_ACCESS_KEY_ID`
- `STORAGE_BUCKET_SECRET_ACCESS_KEY`
- `STORAGE_BUCKET_REGION`
- `STORAGE_BUCKET_ENDPOINT`

값은 Railway reference variable로 연결하고 저장소나 브라우저에 노출하지 않는다.

## 6. 파일 저장 adapter

`src/lib/files/file-storage.ts`의 공개 계약은 유지한다.

- `storeOwnerFile`
- `readOwnerFile` 또는 인증된 download URL 생성
- `deleteOwnerFile`

내부 구현은 두 adapter로 나눈다.

1. `local-file-storage`: development/test에서 `DATA_DIR/files` 사용
2. `railway-bucket-storage`: production에서 S3-compatible Put/Get/Head/Delete 사용

production에서 Bucket 설정이 불완전하면 로컬 디스크로 조용히 fallback하지 않고 `STORAGE_BACKEND_UNAVAILABLE`로 실패한다. Bucket은 private이므로 목록 API는 bucket name, endpoint, credential, raw object key를 반환하지 않는다.

현재 25 MiB 개별 파일 제한은 유지한다. 다운로드는 owner-scoped metadata를 먼저 확인한 뒤 짧은 만료시간의 presigned GET URL로 redirect한다. 파일명은 안전한 `Content-Disposition` 값으로 서명한다.

## 7. Gmail 동기화 설계

### 7.1 readiness

단순히 OAuth token이 검증되었다는 이유만으로 Gmail을 동기화 가능한 상태로 표시하지 않는다. 다음을 모두 만족해야 `sync_ready`다.

- Google Gmail service token의 connection state가 `connected`
- token scope에 `gmail.readonly`, `gmail.modify` 또는 `mail.google.com` 포함
- refresh 또는 active access token 조회 성공

읽기 scope가 없으면 비즈니스 메일 화면과 연동 화면 모두 `Gmail 읽기 권한으로 다시 연결`을 표시한다. `연결됐지만 아직 동기화된 대화가 없습니다`로 숨기지 않는다.

### 7.2 최신 50개

Gmail list API의 `q=newer_than:30d`를 제거하고 `maxResults=50`으로 최신 메시지를 조회한다. Gmail API의 기본 최신순 결과를 사용하되, 상세 message의 Date header를 안전한 ISO timestamp로 정규화한다.

상세 메시지를 모두 받은 뒤 `threadId`로 그룹화한다. 기존 thread record가 있으면 새 message id만 덮어쓰지 않고 기존 id와 합집합으로 병합하고, 실제 message가 존재하는 id만 시간순으로 표시한다.

### 7.3 화면 흐름

1. 메일 탭은 cached conversations와 Gmail readiness를 읽는다.
2. `sync_ready`이고 cached conversation이 0개면 mounted session에서 한 번 자동 동기화한다.
3. 성공하면 응답에 포함된 최신 conversations를 즉시 표시하고 `lastSyncAt`, read count를 갱신한다.
4. 권한 부족은 재연결 CTA를 표시한다.
5. 401/403은 재연결 필요, 429/5xx/timeout은 일시 오류로 구분한다.
6. 새 동기화가 실패해도 기존 cached conversations는 유지한다.
7. 수동 동기화 버튼은 같은 endpoint를 사용하고 성공하지 않은 결과를 성공으로 표시하거나 sync setting을 켜지 않는다.

## 8. API 계약

### `GET /api/storage/usage`

```json
{
  "usageBytes": 0,
  "quotaBytes": 10737418240,
  "remainingBytes": 10737418240,
  "percentUsed": 0,
  "breakdown": {},
  "measuredAt": "ISO-8601"
}
```

모든 값은 authenticated owner에서 계산한다. client가 owner id나 quota를 전달하지 않는다.

### `POST /api/files`

- 기존 multipart 계약과 25 MiB 개별 제한 유지
- owner quota를 원본 저장 전에 확인
- 초과 시 HTTP 413과 `STORAGE_QUOTA_EXCEEDED`
- Bucket write 성공 후 metadata 저장
- metadata 저장 실패 시 방금 생성한 object 삭제

### `GET /api/business/messages?provider=gmail`

- cached conversations
- connection status
- `syncReady`
- `syncBlockReason`
- latest sync summary

### `POST /api/business/messages/sync`

- Gmail 최신 50개 동기화
- 성공: 200
- 권한·재연결 필요: 409
- 일시적 공급자 오류: 502
- cached conversations는 실패 응답에도 포함

## 9. 오류 처리와 보안

- Bucket credential과 OAuth token을 client response, URL, 로그에 기록하지 않는다.
- object key에 원본 이메일이나 파일명을 넣지 않는다.
- 파일 목록과 다운로드는 session owner로만 조회한다.
- presigned URL은 짧게 만료되며 목록 API에 저장하지 않는다.
- quota 검사 실패나 사용량 계산 실패 시 upload를 허용하지 않는다.
- Gmail provider의 원문 오류 body를 그대로 노출하지 않고 안전한 code와 한국어 메시지로 변환한다.
- 애플리케이션 runtime은 Railway Bucket 생성·삭제, Volume wipe와 credential reset을 실행하지 않는다. 승인된 배포 작업에서만 Bucket과 Volume을 만들고 연결한다.

## 10. 테스트

### 저장공간

- quota가 정확히 10 GiB다.
- 0 byte, 소수점 이하 사용률, 100%와 초과 상태를 계산한다.
- 다른 owner의 파일은 사용량에 포함되지 않는다.
- `usage + upload.size === quota`는 허용하고 초과는 거부한다.
- quota 거부 시 Bucket write가 호출되지 않는다.
- metadata 저장 실패 시 생성된 object를 삭제한다.
- production Bucket 설정 누락은 local fallback 없이 실패한다.
- download와 delete는 다른 owner의 object에 접근하지 못한다.

### Gmail

- list request에 `newer_than` query가 없고 `maxResults=50`이다.
- 읽기 scope가 없으면 connected token도 `sync_ready`가 아니다.
- readiness 부족이 명시적 재연결 상태로 표시된다.
- 같은 thread의 기존·신규 message id가 병합된다.
- 최초 자동 동기화는 mounted session에서 한 번만 실행된다.
- 0건 성공과 공급자 실패가 다른 빈 상태를 만든다.
- 실패 응답에도 cached conversations가 남는다.
- integration sync 버튼은 blocked/failed를 성공으로 처리하지 않는다.

### 검증 명령

- 관련 단위·계약 테스트
- 전체 `npm test`
- `npm run typecheck`
- `npm run lint`
- production `npm run build`

## 11. 배포 순서와 롤백

1. 코드와 테스트를 배포 가능 상태로 준비한다.
2. DREAMWISH service의 유효하지 않은 region을 Railway가 현재 제공하는 Singapore 선택값으로 교정한다.
3. Railway production에 `dreamwish-files` Bucket을 만든다.
4. Bucket reference variables를 DREAMWISH service에 연결한다.
5. DREAMWISH service에 `dreamwish-data` Volume을 `/data`로 연결하고 `DATA_DIR=/data`를 설정한다.
6. 새 코드를 배포한다.
7. Gmail 재연결 한 번으로 Gmail service token과 scope를 `/data`에 보존한다.
8. 테스트 계정에서 파일 upload/download/delete, quota 표시, Gmail 최신 50개를 확인한다.

배포 실패 시 이전 애플리케이션 버전으로 rollback하되 Bucket과 Volume은 삭제하지 않는다. Bucket object와 `/data` metadata는 유지한다. credential reset, Bucket 삭제, Volume wipe는 별도 사용자 승인 없이는 수행하지 않는다.

## 12. 완료 기준

- Gmail 읽기 권한이 있는 연결은 비즈니스 메일 탭에서 최신 메시지 50개를 스레드 대화로 표시한다.
- Gmail 읽기 권한이 없으면 연결됨이라는 모호한 빈 상태 대신 재연결 이유를 표시한다.
- 계정 저장공간에 10 GB 한도와 정확한 사용률이 표시된다.
- 한도를 넘는 파일은 Bucket write 전에 거부된다.
- production 파일 원본은 Railway Bucket에, JSON 운영 상태는 `/data` Volume에 재배포 후에도 남는다.
- 전체 테스트, 타입 검사, lint와 production build가 통과한다.
