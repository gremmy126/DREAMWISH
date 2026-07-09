import type { ChatQuickActionId } from "@/src/lib/chat/chat-ui-actions";
import type { ViewId } from "@/components/layout/types";

export type AppLanguage = "ko" | "en" | "ja";

export const APP_TRANSLATIONS = {
  ko: {
    common: {
      loading: "불러오는 중",
      save: "저장",
      close: "닫기",
      delete: "삭제",
      open: "열기",
      connected: "연결됨",
      missing: "누락",
      logout: "로그아웃",
      login: "로그인",
      refresh: "새로고침",
      noAccount: "계정 없음",
      syncOn: "동기화 켜짐",
      syncOff: "동기화 꺼짐"
    },
    language: {
      label: "사이트 언어",
      korean: "한국어",
      english: "영어",
      japanese: "일본어"
    },
    nav: {
      chat: "AI 채팅",
      memory: "메모리",
      crm: "CRM",
      automation: "자동화",
      calendar: "캘린더",
      files: "파일",
      integrations: "연동",
      settings: "설정",
      knowledge: "지식",
      workflow: "워크플로"
    },
    topbar: {
      searchAria: "검색 또는 명령 입력",
      searchPlaceholder: "DREAMWISH에서 검색하거나 명령을 입력하세요",
      notifications: "알림",
      profile: "프로필",
      signedIn: "로그인됨"
    },
    sidebar: {
      productSubtitle: "에이전트 AI OS",
      upgrade: "업그레이드",
      upgradeDescription: "DREAMWISH Pro 결제",
      company: "사업자 정보",
      businessNumber: "사업자 번호",
      commerceNumber: "통신판매업신고번호",
      companyName: "상호명",
      phone: "대표 전화",
      address: "주소"
    },
    auth: {
      title: "DREAMWISH 로그인",
      subtitle: "비밀번호 없이 이메일로 접근 권한을 확인합니다.",
      email: "이메일",
      name: "이름",
      namePlaceholder: "선택 사항",
      submit: "로그인",
      failed: "로그인하지 못했습니다.",
      sessionFailed: "세션을 확인하지 못했습니다.",
      paymentTitle: "결제가 필요합니다",
      paymentBody:
        "{email} 계정은 DREAMWISH Pro 결제 후 사용할 수 있습니다. 관리자 계정만 결제 없이 전체 기능을 사용할 수 있습니다.",
      access: "접근 권한",
      paymentRequired: "결제 필요",
      adminBypass: "관리자 우회",
      off: "꺼짐",
      pay: "결제하기",
      otherEmail: "다른 이메일로 로그인",
      checkoutFailed: "결제를 시작하지 못했습니다."
    },
    chat: {
      sessions: "대화 목록",
      noProject: "프로젝트 없음",
      noSessionsTitle: "대화 없음",
      noSessionsDescription: "질문을 입력하면 로컬 대화가 저장됩니다.",
      createProject: "프로젝트 만들기",
      project: "프로젝트",
      noProjectItems: "대화 목록에서 만든 프로젝트가 여기에 표시됩니다.",
      title: "AI 채팅",
      subtitleNoProject: "프로젝트 없이 채팅합니다.",
      subtitleProject: "{project} 프로젝트에 채팅이 저장됩니다.",
      emptyTitle: "DREAMWISH Command Center",
      emptyDescription:
        "질문, 웹 검색, 파일 첨부, 코드 실행, CRM/Automation 실행 계획을 한곳에서 시작하세요.",
      generating: "답변 생성 중",
      modelTitle: "AI 모델 선택",
      inputPlaceholder: "질문하거나 '웹 검색', '코드:', '할 일', '예약'처럼 입력하세요",
      attachmentMenu: "첨부 메뉴",
      attach: "첨부",
      attachFile: "파일 첨부",
      attachImage: "이미지 첨부",
      voice: "음성 입력",
      send: "전송",
      createProjectTitle: "프로젝트 만들기",
      projectName: "프로젝트 이름",
      noReturnValue: "반환값 없음",
      logs: "로그",
      runResult: "실행 결과",
      webNoResults: "웹 검색 결과가 없습니다.",
      webFailed: "웹 검색에 실패했습니다.",
      codeFailed: "코드 실행에 실패했습니다.",
      answerFailed: "AI 답변을 시작하지 못했습니다.",
      browserVoiceUnsupported: "이 브라우저는 음성 입력을 지원하지 않습니다.",
      voiceFailed: "음성 입력을 완료하지 못했습니다.",
      fileAttached: "파일을 첨부했습니다.",
      imageAttached: "이미지를 첨부했습니다.",
      actions: {
        title: "채팅 액션",
        empty: "할 일과 예약 항목이 없습니다.",
        todo: "할 일",
        schedule: "예약",
        delete: "채팅 액션 삭제",
        todoCreated: "할 일을 만들었습니다.",
        scheduleCreated: "예약 항목을 만들었습니다."
      },
      mode: {
        ask: "질문",
        plan: "계획",
        agent: "에이전트",
        goal: "목표",
        risk: "위험도",
        approvalRequired: "승인 필요",
        planOnly: "계획 모드에서는 실행하지 않고 다음 단계만 정리합니다.",
        approvalFirst:
          "승인 전에는 CRM, Knowledge, Automation, 파일, 외부 앱을 직접 수정하지 않습니다."
      }
    },
    integrations: {
      title: "연동",
      description:
        "Gmail, Google Calendar, Slack, GitHub, Notion, Firebase를 사용자 계정 또는 서버 설정으로 연결하고 Preview와 Approval 뒤에만 실행합니다.",
      preview: "실행 미리보기",
      syncHistory: "동기화 기록",
      connectorLogs: "커넥터 로그",
      connectedMetric: "연결됨",
      aiProviders: "AI 제공자",
      connectGoogle: "Google 계정 연결",
      connectSlack: "Slack 계정 연결",
      connectGithub: "GitHub 계정 연결",
      connectNotion: "Notion 계정 연결",
      connectFirebase: "Firebase 프로젝트 연결",
      disconnect: "연결 해제",
      disconnected: "연결을 해제했습니다.",
      noStoredConnection: "저장된 연결이 없습니다.",
      loading: "연동 상태를 불러오는 중입니다.",
      failed: "연동 상태를 읽지 못했습니다.",
      approved: "승인했습니다. 실제 실행은 Connector Execute 단계에서 기록합니다.",
      rejected: "거절했습니다. 외부 서비스에는 아무 작업도 실행하지 않습니다.",
      noneSelected: "연동 상태를 불러오는 중입니다.",
      firebaseConfigured: "설정됨",
      firebaseMissing: "누락",
      noAccount: "계정 없음"
    },
    context: {
      title: "연결된 맥락",
      description: "현재 질문과 이어진 대화, 문서, 프로젝트, 노트, 파일을 정리합니다.",
      loading: "관련 맥락을 찾는 중입니다.",
      empty: "질문을 입력하면 관련 맥락이 나타납니다.",
      network: "연결 지도",
      networkEmpty: "질문을 입력하면 관련 대화, 웹 검색, 문서와 연결 이유가 표시됩니다.",
      query: "질문",
      searchBase: "검색 기준",
      centralNode: "현재 질문의 중심 노드입니다.",
      link: "링크",
      relevance: "관련",
      suggested: "추천 연결",
      noSuggestions: "추천 연결이 없습니다.",
      accept: "연결 수락",
      openDocument: "문서 열기",
      openApp: "앱 열기",
      accepted: "연결을 수락했습니다.",
      plannerHistory: "Planner - History",
      approvalFirst: "승인 우선",
      nodeType: {
        query: "질문",
        document: "문서",
        project: "프로젝트",
        note: "노트",
        file: "파일",
        tag: "태그",
        task: "작업",
        decision: "결정",
        web: "웹",
        chat: "대화"
      }
    },
    payment: {
      checkoutCreateFailed: "Polar Checkout Session 생성에 실패했습니다.",
      missingToken: "POLAR_ACCESS_TOKEN이 설정되어 있지 않습니다.",
      missingProduct: "POLAR_PRODUCT_ID가 설정되어 있지 않습니다."
    }
  },
  en: {
    common: {
      loading: "Loading",
      save: "Save",
      close: "Close",
      delete: "Delete",
      open: "Open",
      connected: "Connected",
      missing: "Missing",
      logout: "Log out",
      login: "Log in",
      refresh: "Refresh",
      noAccount: "No account",
      syncOn: "Sync on",
      syncOff: "Sync off"
    },
    language: {
      label: "Site language",
      korean: "Korean",
      english: "English",
      japanese: "Japanese"
    },
    nav: {
      chat: "AI Chat",
      memory: "Memory",
      crm: "CRM",
      automation: "Automation",
      calendar: "Calendar",
      files: "Files",
      integrations: "Integrations",
      settings: "Settings",
      knowledge: "Knowledge",
      workflow: "Workflow"
    },
    topbar: {
      searchAria: "Search or enter a command",
      searchPlaceholder: "Search DREAMWISH or enter a command",
      notifications: "Notifications",
      profile: "Profile",
      signedIn: "Signed in"
    },
    sidebar: {
      productSubtitle: "Agentic AI OS",
      upgrade: "Upgrade",
      upgradeDescription: "DREAMWISH Pro payment",
      company: "Company info",
      businessNumber: "Business number",
      commerceNumber: "E-commerce registration",
      companyName: "Company name",
      phone: "Phone",
      address: "Address"
    },
    auth: {
      title: "DREAMWISH Login",
      subtitle: "Use email-only access. No password is required.",
      email: "Email",
      name: "Name",
      namePlaceholder: "Optional",
      submit: "Log in",
      failed: "Could not log in.",
      sessionFailed: "Could not verify the session.",
      paymentTitle: "Payment required",
      paymentBody:
        "{email} can use DREAMWISH after a Pro payment. Only the admin account can use all features without payment.",
      access: "Access",
      paymentRequired: "Payment required",
      adminBypass: "Admin bypass",
      off: "off",
      pay: "Pay",
      otherEmail: "Log in with another email",
      checkoutFailed: "Could not start checkout."
    },
    chat: {
      sessions: "Conversations",
      noProject: "No project",
      noSessionsTitle: "No conversations",
      noSessionsDescription: "A local conversation is saved after you send a question.",
      createProject: "Create project",
      project: "Project",
      noProjectItems: "Projects created from conversations appear here.",
      title: "AI Chat",
      subtitleNoProject: "Chatting without a project.",
      subtitleProject: "Chat is saved to the {project} project.",
      emptyTitle: "DREAMWISH Command Center",
      emptyDescription:
        "Start questions, web search, file attachments, code runs, and CRM/Automation plans in one place.",
      generating: "Generating answer",
      modelTitle: "Select AI model",
      inputPlaceholder: "Ask a question or type commands like web search, code:, todo, schedule",
      attachmentMenu: "Attachment menu",
      attach: "Attach",
      attachFile: "Attach file",
      attachImage: "Attach image",
      voice: "Voice input",
      send: "Send",
      createProjectTitle: "Create project",
      projectName: "Project name",
      noReturnValue: "No return value",
      logs: "Logs",
      runResult: "Run result",
      webNoResults: "No web search results.",
      webFailed: "Web search failed.",
      codeFailed: "Code execution failed.",
      answerFailed: "Could not start the AI answer.",
      browserVoiceUnsupported: "This browser does not support voice input.",
      voiceFailed: "Voice input could not finish.",
      fileAttached: "File attached.",
      imageAttached: "Image attached.",
      actions: {
        title: "Chat Actions",
        empty: "No todos or scheduled items.",
        todo: "Todo",
        schedule: "Schedule",
        delete: "Delete chat action",
        todoCreated: "Todo created.",
        scheduleCreated: "Scheduled item created."
      },
      mode: {
        ask: "Ask",
        plan: "Plan",
        agent: "Agent",
        goal: "Goal",
        risk: "Risk",
        approvalRequired: "Approval required",
        planOnly: "Plan mode does not execute anything; it only prepares the next steps.",
        approvalFirst:
          "Before approval, CRM, Knowledge, Automation, files, and connected apps are not modified."
      }
    },
    integrations: {
      title: "Integrations",
      description:
        "Connect Gmail, Google Calendar, Slack, GitHub, Notion, and Firebase through user accounts or server configuration. Execution stays preview-and-approval first.",
      preview: "Execution Preview",
      syncHistory: "Sync History",
      connectorLogs: "Connector Logs",
      connectedMetric: "Connected",
      aiProviders: "AI Providers",
      connectGoogle: "Connect Google",
      connectSlack: "Connect Slack",
      connectGithub: "Connect GitHub",
      connectNotion: "Connect Notion",
      connectFirebase: "Connect Firebase",
      disconnect: "Disconnect",
      disconnected: "Disconnected.",
      noStoredConnection: "No stored connection.",
      loading: "Loading integration status.",
      failed: "Could not load integration status.",
      approved: "Approved. Real execution is recorded in the Connector Execute step.",
      rejected: "Rejected. No external service action was executed.",
      noneSelected: "Loading integration status.",
      firebaseConfigured: "Configured",
      firebaseMissing: "Missing",
      noAccount: "No account"
    },
    context: {
      title: "Connected Context",
      description:
        "Shows conversations, documents, projects, notes, and files related to the current question.",
      loading: "Finding related context.",
      empty: "Related context appears after you enter a question.",
      network: "Connection Map",
      networkEmpty:
        "Enter a question to see related conversations, web search results, documents, and why they are connected.",
      query: "Question",
      searchBase: "Search basis",
      centralNode: "Central node for the current question.",
      link: "Link",
      relevance: "relevant",
      suggested: "Suggested Connections",
      noSuggestions: "No suggested connections.",
      accept: "Accept connection",
      openDocument: "Open document",
      openApp: "Open app",
      accepted: "Connection accepted.",
      plannerHistory: "Planner - History",
      approvalFirst: "approval-first",
      nodeType: {
        query: "Question",
        document: "Document",
        project: "Project",
        note: "Note",
        file: "File",
        tag: "Tag",
        task: "Task",
        decision: "Decision",
        web: "Web",
        chat: "Chat"
      }
    },
    payment: {
      checkoutCreateFailed: "Polar Checkout Session could not be created.",
      missingToken: "POLAR_ACCESS_TOKEN is not configured.",
      missingProduct: "POLAR_PRODUCT_ID is not configured."
    }
  },
  ja: {
    common: {
      loading: "読み込み中",
      save: "保存",
      close: "閉じる",
      delete: "削除",
      open: "開く",
      connected: "接続済み",
      missing: "未設定",
      logout: "ログアウト",
      login: "ログイン",
      refresh: "更新",
      noAccount: "アカウントなし",
      syncOn: "同期オン",
      syncOff: "同期オフ"
    },
    language: {
      label: "サイト言語",
      korean: "韓国語",
      english: "英語",
      japanese: "日本語"
    },
    nav: {
      chat: "AIチャット",
      memory: "メモリ",
      crm: "CRM",
      automation: "自動化",
      calendar: "カレンダー",
      files: "ファイル",
      integrations: "連携",
      settings: "設定",
      knowledge: "知識",
      workflow: "ワークフロー"
    },
    topbar: {
      searchAria: "検索またはコマンド入力",
      searchPlaceholder: "DREAMWISHで検索またはコマンドを入力",
      notifications: "通知",
      profile: "プロフィール",
      signedIn: "ログイン中"
    },
    sidebar: {
      productSubtitle: "エージェントAI OS",
      upgrade: "アップグレード",
      upgradeDescription: "DREAMWISH Pro決済",
      company: "会社情報",
      businessNumber: "事業者番号",
      commerceNumber: "通信販売届出番号",
      companyName: "会社名",
      phone: "代表電話",
      address: "住所"
    },
    auth: {
      title: "DREAMWISHログイン",
      subtitle: "パスワードなしでメールアドレスだけでアクセス権を確認します。",
      email: "メール",
      name: "名前",
      namePlaceholder: "任意",
      submit: "ログイン",
      failed: "ログインできませんでした。",
      sessionFailed: "セッションを確認できませんでした。",
      paymentTitle: "決済が必要です",
      paymentBody:
        "{email}はDREAMWISH Proの決済後に利用できます。管理者アカウントだけが決済なしで全機能を利用できます。",
      access: "アクセス",
      paymentRequired: "決済必要",
      adminBypass: "管理者バイパス",
      off: "オフ",
      pay: "決済する",
      otherEmail: "別のメールでログイン",
      checkoutFailed: "決済を開始できませんでした。"
    },
    chat: {
      sessions: "会話一覧",
      noProject: "プロジェクトなし",
      noSessionsTitle: "会話なし",
      noSessionsDescription: "質問を送るとローカル会話が保存されます。",
      createProject: "プロジェクト作成",
      project: "プロジェクト",
      noProjectItems: "会話から作成したプロジェクトがここに表示されます。",
      title: "AIチャット",
      subtitleNoProject: "プロジェクトなしでチャットします。",
      subtitleProject: "{project}プロジェクトにチャットを保存します。",
      emptyTitle: "DREAMWISH Command Center",
      emptyDescription:
        "質問、Web検索、ファイル添付、コード実行、CRM/Automationの実行計画をここから始められます。",
      generating: "回答を生成中",
      modelTitle: "AIモデル選択",
      inputPlaceholder: "質問、またはWeb検索、code:、TODO、予約のように入力してください",
      attachmentMenu: "添付メニュー",
      attach: "添付",
      attachFile: "ファイル添付",
      attachImage: "画像添付",
      voice: "音声入力",
      send: "送信",
      createProjectTitle: "プロジェクト作成",
      projectName: "プロジェクト名",
      noReturnValue: "戻り値なし",
      logs: "ログ",
      runResult: "実行結果",
      webNoResults: "Web検索結果がありません。",
      webFailed: "Web検索に失敗しました。",
      codeFailed: "コード実行に失敗しました。",
      answerFailed: "AI回答を開始できませんでした。",
      browserVoiceUnsupported: "このブラウザは音声入力に対応していません。",
      voiceFailed: "音声入力を完了できませんでした。",
      fileAttached: "ファイルを添付しました。",
      imageAttached: "画像を添付しました。",
      actions: {
        title: "チャットアクション",
        empty: "TODOと予約項目はありません。",
        todo: "TODO",
        schedule: "予約",
        delete: "チャットアクションを削除",
        todoCreated: "TODOを作成しました。",
        scheduleCreated: "予約項目を作成しました。"
      },
      mode: {
        ask: "質問",
        plan: "計画",
        agent: "エージェント",
        goal: "目標",
        risk: "リスク",
        approvalRequired: "承認が必要",
        planOnly: "計画モードでは実行せず、次の手順だけを整理します。",
        approvalFirst:
          "承認前にCRM、Knowledge、Automation、ファイル、外部アプリを直接変更しません。"
      }
    },
    integrations: {
      title: "連携",
      description:
        "Gmail、Google Calendar、Slack、GitHub、Notion、Firebaseをユーザーアカウントまたはサーバー設定で接続し、PreviewとApproval後にのみ実行します。",
      preview: "実行プレビュー",
      syncHistory: "同期履歴",
      connectorLogs: "コネクタログ",
      connectedMetric: "接続済み",
      aiProviders: "AIプロバイダー",
      connectGoogle: "Google接続",
      connectSlack: "Slack接続",
      connectGithub: "GitHub接続",
      connectNotion: "Notion接続",
      connectFirebase: "Firebase接続",
      disconnect: "接続解除",
      disconnected: "接続を解除しました。",
      noStoredConnection: "保存された接続はありません。",
      loading: "連携状態を読み込み中です。",
      failed: "連携状態を読み込めませんでした。",
      approved: "承認しました。実行はConnector Executeステップに記録します。",
      rejected: "拒否しました。外部サービスには何も実行しません。",
      noneSelected: "連携状態を読み込み中です。",
      firebaseConfigured: "設定済み",
      firebaseMissing: "未設定",
      noAccount: "アカウントなし"
    },
    context: {
      title: "接続された文脈",
      description: "現在の質問に関連する会話、文書、プロジェクト、ノート、ファイルを整理します。",
      loading: "関連する文脈を検索中です。",
      empty: "質問を入力すると関連する文脈が表示されます。",
      network: "接続マップ",
      networkEmpty:
        "質問を入力すると、関連する会話、Web検索結果、文書、接続理由が表示されます。",
      query: "質問",
      searchBase: "検索基準",
      centralNode: "現在の質問の中心ノードです。",
      link: "リンク",
      relevance: "関連",
      suggested: "おすすめ接続",
      noSuggestions: "おすすめ接続はありません。",
      accept: "接続を承認",
      openDocument: "文書を開く",
      openApp: "アプリを開く",
      accepted: "接続を承認しました。",
      plannerHistory: "Planner - History",
      approvalFirst: "承認優先",
      nodeType: {
        query: "質問",
        document: "文書",
        project: "プロジェクト",
        note: "ノート",
        file: "ファイル",
        tag: "タグ",
        task: "タスク",
        decision: "決定",
        web: "Web",
        chat: "会話"
      }
    },
    payment: {
      checkoutCreateFailed: "Polar Checkout Sessionを作成できませんでした。",
      missingToken: "POLAR_ACCESS_TOKENが設定されていません。",
      missingProduct: "POLAR_PRODUCT_IDが設定されていません。"
    }
  }
} as const;

export type TranslationKey = string;

export function t(language: AppLanguage, key: TranslationKey, values: Record<string, string> = {}) {
  const dictionary = APP_TRANSLATIONS[language] || APP_TRANSLATIONS.ko;
  const fallback = APP_TRANSLATIONS.ko;
  const value = readPath(dictionary, key) ?? readPath(fallback, key) ?? key;
  return interpolate(String(value), values);
}

export function getNavLabel(view: ViewId, language: AppLanguage) {
  return t(language, `nav.${view}`);
}

export function getChatQuickActionText(id: ChatQuickActionId, language: AppLanguage) {
  const labels: Record<ChatQuickActionId, { label: string; prompt: string }> = {
    todo: {
      label: t(language, "chat.actions.todo"),
      prompt:
        language === "en" ? "todo: " : language === "ja" ? "TODO: " : "할 일: "
    },
    schedule: {
      label: t(language, "chat.actions.schedule"),
      prompt:
        language === "en" ? "schedule: " : language === "ja" ? "予約: " : "예약: "
    },
    web_search: {
      label: language === "en" ? "Web Search" : language === "ja" ? "Web検索" : "웹 검색",
      prompt:
        language === "en" ? "web search " : language === "ja" ? "Web検索 " : "웹 검색 "
    },
    code_run: {
      label: language === "en" ? "Run Code" : language === "ja" ? "コード実行" : "코드 실행",
      prompt: language === "en" ? "code: " : language === "ja" ? "code: " : "코드: "
    },
    automation: {
      label: language === "en" ? "Automate" : language === "ja" ? "自動化" : "자동화",
      prompt:
        language === "en"
          ? "create automation "
          : language === "ja"
            ? "自動化を作成 "
            : "자동화 만들기 "
    },
    approval_queue: {
      label: language === "en" ? "Approvals" : language === "ja" ? "承認待ち" : "승인 대기",
      prompt:
        language === "en"
          ? "show approval queue"
          : language === "ja"
            ? "承認待ちを表示"
            : "승인 대기 작업 보여줘"
    }
  };

  return labels[id];
}

function readPath(source: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[part];
  }, source);
}

function interpolate(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template
  );
}
