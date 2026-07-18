# DREAMWISH Companion

Android와 iPhone에서 설치해 사용하는 별도 Bare React Native 앱입니다. 웹에서 만든 QR 또는 App/Universal Link로 휴대폰을 연결하고, Android의 사용자가 허용한 알림이나 iPhone Share Extension으로 명시적으로 공유한 텍스트를 암호화된 오프라인 큐에 보관한 뒤 동기화합니다.

## 보안 계약

- 페어링 때 앱이 P-256 키 쌍을 만들고 공개키만 서버에 등록합니다.
- 개인키는 Android Keystore 또는 iOS Keychain 밖으로 내보내지 않습니다.
- 모든 동기화와 푸시 토큰 등록은 단조 증가 sequence와 ES256 서명을 사용합니다.
- 기기 비밀 문자열이나 `Authorization: Device <secret>` 방식은 사용하지 않습니다.
- Android는 사용자가 선택한 패키지의 알림만 로컬에서 필터링합니다. SMS와 통화 기록 권한은 요청하지 않습니다.
- iPhone cannot read other apps' notifications. Share Extension에서 사용자가 직접 공유한 텍스트만 받습니다.
- 매출 원문은 기기에서 먼저 계좌 형태를 마스킹하고 암호화 큐에 저장합니다. 서버에서도 다시 마스킹하고 전용 키로 암호화합니다.
- 모바일 푸시에는 후보 ID와 안전한 화면 경로만 포함하며, 금액·계좌·원문을 넣지 않습니다.

## 실행 준비

Node.js 22 이상을 설치한 뒤 이 폴더에서 `npm install`을 실행합니다.

Android:

1. Firebase Android 앱 `kr.co.dreamwish.companion`의 `google-services.json`을 `android/app/`에 둡니다.
2. Android SDK 36과 JDK 17을 준비합니다.
3. `npm run android`로 debug 앱을 실행합니다.
4. release 빌드에는 `DREAMWISH_UPLOAD_STORE_FILE`, `DREAMWISH_UPLOAD_STORE_PASSWORD`, `DREAMWISH_UPLOAD_KEY_ALIAS`, `DREAMWISH_UPLOAD_KEY_PASSWORD`를 설정합니다.

iOS:

1. Firebase iOS 앱 `kr.co.dreamwish.companion`의 `GoogleService-Info.plist`를 앱 target에 추가합니다.
2. macOS/Xcode에서 `cd ios && pod install`을 실행합니다.
3. 앱과 Share Extension에 `group.kr.co.dreamwish.companion` App Group을 활성화하고 자신의 Team/provisioning profile을 선택합니다.
4. `npm run ios` 또는 생성된 workspace를 Xcode에서 실행합니다.

웹 연결 주소는 `https://dreamwish.co.kr/companion/pair?...`이며 Android App Links와 iOS Universal Links가 이 주소를 앱으로 전달합니다. 연결 완료 후 알림 수집과 푸시는 설정 화면에서 각각 사용자가 켭니다.

## 배포 전 필수 검증

- Android 실제 기기에서 앱 링크, 알림 접근 allowlist, 네트워크 단절/복구, 재부팅 후 WorkManager 재시도
- iPhone 실제 기기에서 Universal Link, Share Extension, App Group 암호화 큐, 백그라운드 푸시
- 서버에서 동일 event ID/sequence 재전송 거부와 기기 해제 후 푸시 토큰 폐기
- Play Console/App Store Connect의 서명, 개인정보 표시, 데이터 안전성 문항
