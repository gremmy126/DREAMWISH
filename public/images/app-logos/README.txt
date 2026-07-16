공식 앱 로고 넣는 곳
====================

이 폴더(또는 public/images 바로 아래)에 "{앱ID}.svg" 또는 "{앱ID}.png"
이름으로 공식 브랜드 로고 파일을 넣으면, 자동화·연동 화면에서
기본 아이콘 대신 자동으로 이 파일이 우선 사용됩니다.

예시 파일명:
  linear.svg    jira.svg    hubspot.svg    shopify.svg
  figma.png     salesforce.svg    stripe.svg    airtable.svg

앱 ID는 src/lib/automation/app-registry.ts 의 id 값과 같아야 합니다.
파일이 없으면 기존 아이콘(public/automation-icons)으로 자동 폴백됩니다.
