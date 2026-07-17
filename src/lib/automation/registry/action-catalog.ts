import type {
  ActionAdditionalAuth,
  ActionConfirmationPhrase,
  ActionDefinition,
  ActionFieldDefinition,
  ActionFieldType,
  ActionKind,
  ActionOutputField,
  ActionRiskLevel,
  PreviewDefinition,
  RiskEscalationRule,
  ValidationRule
} from "./action.types";

type Options = {
  risk?: ActionRiskLevel;
  scopes?: string[];
  phrase?: ActionConfirmationPhrase;
  additionalAuth?: ActionAdditionalAuth[];
  validation?: ValidationRule[];
  riskRules?: RiskEscalationRule[];
  preview?: Partial<PreviewDefinition>;
  output?: ActionOutputField[];
  defaults?: ActionDefinition["defaultValues"];
};

const field = (
  id: string,
  label: string,
  type: ActionFieldType = "text",
  requiredOrExtra: boolean | Partial<ActionFieldDefinition> = true,
  extra: Partial<ActionFieldDefinition> = {}
): ActionFieldDefinition => ({
  id,
  label,
  type,
  required: typeof requiredOrExtra === "boolean" ? requiredOrExtra : true,
  mappable: true,
  ...(typeof requiredOrExtra === "boolean" ? extra : requiredOrExtra)
});

const optional = (id: string, label: string, type: ActionFieldType = "text", extra: Partial<ActionFieldDefinition> = {}) =>
  field(id, label, type, false, extra);

const action = (
  appId: string,
  id: string,
  name: string,
  kind: ActionKind,
  fields: ActionFieldDefinition[],
  options: Options = {}
): ActionDefinition => {
  const risk = options.risk || defaultRisk(kind);
  return {
    id,
    version: 1,
    appId,
    name,
    description: `${name} 작업을 실행합니다.`,
    kind,
    inputSchema: { fields },
    outputSchema: { fields: options.output || outputFor(id, kind) },
    outputSchemaVersion: 1,
    validation: options.validation || [],
    defaultValues: options.defaults || {},
    requiredScopes: options.scopes || [],
    riskLevel: risk,
    riskRules: options.riskRules || [],
    previewDefinition: {
      title: `${name} Preview`,
      targetFields: fields.slice(0, 2).map((item) => item.id),
      reversible: !["high", "critical"].includes(risk),
      failureImpact: defaultFailureImpact(risk),
      ...options.preview
    },
    adapterKey: `${appId}.${id}`,
    adapterVersion: 1,
    confirmationPhrase: options.phrase || null,
    additionalAuth: options.additionalAuth || (risk === "critical" ? ["password", "otp", "admin"] : [])
  };
};

const critical = (phrase: Exclude<ActionConfirmationPhrase, null>): Options => ({
  risk: "critical",
  phrase,
  additionalAuth: ["password", "otp", "admin"]
});
const high = (phrase: Exclude<ActionConfirmationPhrase, null> = "DELETE"): Options => ({ risk: "high", phrase });

const gmail = [
  action("gmail", "watch-new-email", "새 이메일 감지", "trigger", [optional("mailbox", "Mailbox"), optional("label", "Label"), optional("from", "From", "email"), optional("to", "To", "email"), optional("subject", "Subject"), optional("hasAttachment", "Has attachment", "boolean"), optional("after", "After", "datetime"), optional("before", "Before", "datetime")], { risk: "read", scopes: ["gmail.readonly"] }),
  action("gmail", "send-email", "이메일 보내기", "write", [field("to", "To", "email"), optional("cc", "Cc", "email"), optional("bcc", "Bcc", "email"), field("subject", "Subject"), field("body", "Body", "textarea"), optional("attachments", "Attachments", "array", { itemType: "file" })], { risk: "medium", scopes: ["gmail.send"] }),
  action("gmail", "reply-email", "이메일 답장", "write", [field("messageId", "Message ID", "resource"), field("body", "Body", "textarea")], { risk: "medium", scopes: ["gmail.modify", "gmail.send"] }),
  action("gmail", "forward-email", "이메일 전달", "write", [field("messageId", "Message ID", "resource"), field("to", "To", "email"), optional("message", "Message", "textarea")], { risk: "medium", scopes: ["gmail.modify", "gmail.send"] }),
  action("gmail", "create-draft", "초안 생성", "write", [field("to", "To", "email"), optional("cc", "Cc", "email"), field("subject", "Subject"), field("body", "Body", "textarea"), optional("attachments", "Attachments", "array", { itemType: "file" })], { risk: "low", scopes: ["gmail.compose"] }),
  action("gmail", "permanently-delete-email", "이메일 영구 삭제", "write", [field("messageId", "Message ID", "resource"), optional("reason", "Deletion reason")], { ...high("DELETE"), scopes: ["gmail.modify"] }),
  action("gmail", "mark-read", "읽음 처리", "write", [field("messageId", "Message ID", "resource")], { risk: "low", scopes: ["gmail.modify"] }),
  action("gmail", "mark-unread", "안읽음 처리", "write", [field("messageId", "Message ID", "resource")], { risk: "low", scopes: ["gmail.modify"] }),
  action("gmail", "archive-email", "보관", "write", [field("messageId", "Message ID", "resource")], { risk: "low", scopes: ["gmail.modify"] }),
  action("gmail", "add-label", "라벨 추가", "write", [field("messageId", "Message ID", "resource"), field("labelId", "Label", "resource")], { risk: "low", scopes: ["gmail.modify"] }),
  action("gmail", "remove-label", "라벨 제거", "write", [field("messageId", "Message ID", "resource"), field("labelId", "Label", "resource")], { risk: "low", scopes: ["gmail.modify"] }),
  action("gmail", "download-attachment", "첨부파일 다운로드", "read", [field("messageId", "Message ID", "resource"), field("attachmentId", "Attachment ID", "resource")], { risk: "read", scopes: ["gmail.readonly"] }),
  action("gmail", "save-attachment", "첨부파일 저장", "write", [field("messageId", "Message ID", "resource"), field("attachmentId", "Attachment ID", "resource"), field("destination", "Destination", "resource")], { risk: "low", scopes: ["gmail.readonly"] }),
  action("gmail", "search-email", "메일 검색", "read", [field("query", "Search query"), optional("mailbox", "Mailbox"), optional("limit", "Limit", "integer", { min: 1, max: 100 })], { risk: "read", scopes: ["gmail.readonly"], defaults: { limit: 25 } })
];

const notion = [
  action("notion", "create-database-item", "데이터베이스 항목 생성", "write", [field("databaseId", "Database ID", "resource"), field("title", "Title"), field("properties", "Properties", "json"), optional("content", "Content", "textarea"), optional("icon", "Icon", "url"), optional("cover", "Cover", "url")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "update-database-item", "데이터베이스 항목 수정", "write", [field("pageId", "Page ID", "resource"), field("properties", "Properties", "json"), optional("archived", "Archived", "boolean")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "query-database", "데이터베이스 조회", "read", [field("databaseId", "Database ID", "resource"), optional("filter", "Filter", "json"), optional("sorts", "Sorts", "json"), optional("pageSize", "Page size", "integer", { min: 1, max: 100 })], { risk: "read", scopes: ["content.read"] }),
  action("notion", "create-page", "페이지 생성", "write", [field("parentId", "Parent page ID", "resource"), field("title", "Title"), optional("properties", "Properties", "json"), optional("content", "Content", "textarea"), optional("icon", "Icon", "url"), optional("cover", "Cover", "url")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "update-page", "페이지 수정", "write", [field("pageId", "Page ID", "resource"), field("properties", "Properties", "json"), optional("content", "Content", "textarea")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "get-page", "페이지 조회", "read", [field("pageId", "Page ID", "resource")], { risk: "read", scopes: ["content.read"] }),
  action("notion", "append-block", "블록 추가", "write", [field("parentBlockId", "Parent block ID", "resource"), field("children", "Blocks", "json")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "update-block", "블록 수정", "write", [field("blockId", "Block ID", "resource"), field("content", "Block content", "json")], { risk: "medium", scopes: ["content.write"] }),
  action("notion", "create-comment", "댓글 작성", "write", [field("pageId", "Page ID", "resource"), field("comment", "Comment", "textarea")], { risk: "medium", scopes: ["comments.write"] }),
  action("notion", "search-page", "페이지 검색", "read", [optional("query", "Query"), optional("sortDirection", "Sort direction", "select", { options: [{ label: "Descending", value: "descending" }, { label: "Ascending", value: "ascending" }] }), optional("pageSize", "Page size", "integer", { min: 1, max: 100 })], { risk: "read", scopes: ["content.read"] })
];

const sheets = [
  action("google-sheets", "add-row", "행 추가", "write", [field("spreadsheetId", "Spreadsheet", "resource"), field("sheet", "Sheet", "resource"), field("columns", "Columns", "json")], { risk: "medium", scopes: ["spreadsheets"] }),
  action("google-sheets", "update-row", "행 수정", "write", [field("spreadsheetId", "Spreadsheet", "resource"), field("sheet", "Sheet", "resource"), field("row", "Row", "integer", { min: 1 }), field("columns", "Columns", "json")], { risk: "medium", scopes: ["spreadsheets"] }),
  action("google-sheets", "delete-row", "행 삭제", "write", [field("spreadsheetId", "Spreadsheet", "resource"), field("sheet", "Sheet", "resource"), field("row", "Row", "integer", { min: 1 })], { ...high("DELETE"), scopes: ["spreadsheets"] }),
  action("google-sheets", "get-row", "행 조회", "read", [field("spreadsheetId", "Spreadsheet", "resource"), field("sheet", "Sheet", "resource"), field("row", "Row", "integer", { min: 1 })], { risk: "read", scopes: ["spreadsheets.readonly"] }),
  action("google-sheets", "create-sheet", "시트 생성", "write", [field("spreadsheetId", "Spreadsheet", "resource"), field("title", "Sheet title"), optional("rowCount", "Rows", "integer", { min: 1 }), optional("columnCount", "Columns", "integer", { min: 1 })], { risk: "low", scopes: ["spreadsheets"] }),
  action("google-sheets", "get-sheet", "시트 조회", "read", [field("spreadsheetId", "Spreadsheet", "resource"), optional("sheet", "Sheet", "resource")], { risk: "read", scopes: ["spreadsheets.readonly"] })
];

const slack = [
  action("slack", "send-channel-message", "채널 메시지", "write", [field("workspaceId", "Workspace", "resource"), field("channel", "Channel", "resource"), field("message", "Message", "textarea"), optional("blocks", "Blocks", "json")], { risk: "medium", scopes: ["chat:write"] }),
  action("slack", "send-direct-message", "DM 보내기", "write", [field("workspaceId", "Workspace", "resource"), field("userId", "User", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["chat:write", "im:write"] }),
  action("slack", "reply-thread", "스레드 답장", "write", [field("channel", "Channel", "resource"), field("threadTs", "Thread", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["chat:write"] }),
  action("slack", "add-reaction", "리액션 추가", "write", [field("channel", "Channel", "resource"), field("timestamp", "Message timestamp"), field("emoji", "Emoji")], { risk: "low", scopes: ["reactions:write"] }),
  action("slack", "create-channel", "채널 생성", "write", [field("workspaceId", "Workspace", "resource"), field("name", "Channel name"), optional("private", "Private", "boolean")], { risk: "medium", scopes: ["channels:manage"] }),
  action("slack", "get-user", "사용자 조회", "read", [field("workspaceId", "Workspace", "resource"), field("userId", "User", "resource")], { risk: "read", scopes: ["users:read"] })
];

const calendar = [
  action("calendar", "create-event", "일정 생성", "write", [field("calendarId", "Calendar", "resource"), field("title", "Title"), optional("description", "Description", "textarea"), field("start", "Start", "datetime"), field("end", "End", "datetime"), optional("guests", "Guests", "array", { itemType: "email" }), optional("location", "Location")], { risk: "medium", scopes: ["calendar.events"], validation: [{ kind: "less_than_or_equal", left: "start", right: "end", message: "종료 시각은 시작 시각 이후여야 합니다." }] }),
  action("calendar", "update-event", "일정 수정", "write", [field("calendarId", "Calendar", "resource"), field("eventId", "Event", "resource"), optional("title", "Title"), optional("description", "Description", "textarea"), optional("start", "Start", "datetime"), optional("end", "End", "datetime"), optional("guests", "Guests", "array", { itemType: "email" }), optional("location", "Location")], { risk: "medium", scopes: ["calendar.events"] }),
  action("calendar", "delete-event", "일정 삭제", "write", [field("calendarId", "Calendar", "resource"), field("eventId", "Event", "resource"), optional("notifyGuests", "Notify guests", "boolean")], { ...high("DELETE"), scopes: ["calendar.events"] }),
  action("calendar", "get-events", "일정 조회", "read", [field("calendarId", "Calendar", "resource"), optional("start", "From", "datetime"), optional("end", "To", "datetime"), optional("query", "Query")], { risk: "read", scopes: ["calendar.readonly"] })
];

const discord = [
  action("discord", "send-channel-message", "채널 메시지", "write", [field("serverId", "Server", "resource"), field("channelId", "Channel", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["messages.write"] }),
  action("discord", "send-direct-message", "DM", "write", [field("userId", "User", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["messages.write"] }),
  action("discord", "add-role", "역할 추가", "write", [field("serverId", "Server", "resource"), field("userId", "User", "resource"), field("roleId", "Role", "resource")], { ...high("DEPLOY"), scopes: ["guilds.members.write"] }),
  action("discord", "remove-role", "역할 제거", "write", [field("serverId", "Server", "resource"), field("userId", "User", "resource"), field("roleId", "Role", "resource")], { ...high("DELETE"), scopes: ["guilds.members.write"] }),
  action("discord", "create-channel", "채널 생성", "write", [field("serverId", "Server", "resource"), field("name", "Channel name"), optional("type", "Type", "select", { options: [{ label: "Text", value: "text" }, { label: "Voice", value: "voice" }] })], { risk: "medium", scopes: ["guilds.channels.write"] }),
  action("discord", "create-thread", "스레드 생성", "write", [field("channelId", "Channel", "resource"), field("name", "Thread name"), optional("messageId", "Start message", "resource")], { risk: "medium", scopes: ["messages.write"] })
];

const telegram = [
  action("telegram", "send-message", "메시지 보내기", "write", [field("chatId", "Chat", "resource"), field("message", "Message", "textarea"), optional("parseMode", "Parse mode", "select", { options: [{ label: "Plain", value: "plain" }, { label: "Markdown", value: "MarkdownV2" }, { label: "HTML", value: "HTML" }] })], { risk: "medium" }),
  action("telegram", "send-photo", "사진 보내기", "write", [field("chatId", "Chat", "resource"), field("photo", "Photo", "file"), optional("caption", "Caption", "textarea")], { risk: "medium" }),
  action("telegram", "send-document", "문서 보내기", "write", [field("chatId", "Chat", "resource"), field("document", "Document", "file"), optional("caption", "Caption", "textarea")], { risk: "medium" }),
  action("telegram", "send-file", "파일 보내기", "write", [field("chatId", "Chat", "resource"), field("file", "File", "file"), optional("caption", "Caption", "textarea")], { risk: "medium" })
];

const github = [
  action("github", "create-issue", "Issue 생성", "write", [field("repository", "Repository", "resource"), field("title", "Title"), optional("body", "Body", "textarea"), optional("labels", "Labels", "array", { itemType: "text" }), optional("assignees", "Assignees", "array", { itemType: "text" })], { risk: "medium", scopes: ["issues:write"] }),
  action("github", "update-issue", "Issue 수정", "write", [field("repository", "Repository", "resource"), field("issueNumber", "Issue number", "integer", { min: 1 }), optional("title", "Title"), optional("body", "Body", "textarea"), optional("state", "State", "select", { options: [{ label: "Open", value: "open" }, { label: "Closed", value: "closed" }] })], { risk: "medium", scopes: ["issues:write"] }),
  action("github", "comment-issue", "Issue 댓글", "write", [field("repository", "Repository", "resource"), field("issueNumber", "Issue number", "integer", { min: 1 }), field("body", "Comment", "textarea")], { risk: "medium", scopes: ["issues:write"] }),
  action("github", "create-pull-request", "Pull Request 생성", "write", [field("repository", "Repository", "resource"), field("head", "Head branch", "resource"), field("base", "Base branch", "resource"), field("title", "Title"), optional("body", "Body", "textarea"), optional("draft", "Draft", "boolean")], { risk: "medium", scopes: ["pull_requests:write"] }),
  action("github", "comment-pull-request", "Pull Request 댓글", "write", [field("repository", "Repository", "resource"), field("pullNumber", "Pull request number", "integer", { min: 1 }), field("body", "Comment", "textarea")], { risk: "medium", scopes: ["pull_requests:write"] }),
  action("github", "create-branch", "Branch 생성", "write", [field("repository", "Repository", "resource"), field("branch", "Branch"), field("fromRef", "From ref", "resource")], { risk: "medium", scopes: ["contents:write"] }),
  action("github", "delete-branch", "Branch 삭제", "write", [field("repository", "Repository", "resource"), field("branch", "Branch", "resource")], { ...high("DELETE"), scopes: ["contents:write"] }),
  action("github", "create-file", "File 생성", "write", [field("repository", "Repository", "resource"), field("branch", "Branch", "resource"), field("path", "Path"), field("content", "Content", "textarea"), field("message", "Commit message")], { risk: "medium", scopes: ["contents:write"] }),
  action("github", "update-file", "File 수정", "write", [field("repository", "Repository", "resource"), field("branch", "Branch", "resource"), field("path", "Path"), field("sha", "Current SHA"), field("content", "Content", "textarea"), field("message", "Commit message")], { risk: "medium", scopes: ["contents:write"] }),
  action("github", "delete-file", "File 삭제", "write", [field("repository", "Repository", "resource"), field("branch", "Branch", "resource"), field("path", "Path"), field("sha", "Current SHA"), field("message", "Commit message")], { ...high("DELETE"), scopes: ["contents:write"] }),
  action("github", "dispatch-workflow", "Workflow 실행", "write", [field("repository", "Repository", "resource"), field("workflowId", "Workflow", "resource"), field("ref", "Ref", "resource"), optional("inputs", "Inputs", "json"), optional("environment", "Environment", "select", { options: [{ label: "Development", value: "development" }, { label: "Production", value: "production" }] })], { risk: "high", phrase: "DEPLOY", scopes: ["actions:write"], riskRules: [{ field: "environment", operator: "equals", value: "production", riskLevel: "critical", reason: "운영 Workflow 실행" }] }),
  action("github", "create-release", "Release 생성", "write", [field("repository", "Repository", "resource"), field("tag", "Tag"), optional("target", "Target", "resource"), field("name", "Release name"), optional("body", "Release notes", "textarea"), optional("prerelease", "Prerelease", "boolean")], { ...high("DEPLOY"), scopes: ["contents:write"] })
];

const drive = [
  action("drive", "upload-file", "파일 업로드", "write", [field("file", "File", "file"), optional("folderId", "Folder", "resource"), optional("name", "File name")], { risk: "medium", scopes: ["drive.file"] }),
  action("drive", "download-file", "파일 다운로드", "read", [field("fileId", "File", "resource")], { risk: "read", scopes: ["drive.readonly"] }),
  action("drive", "move-file", "파일 이동", "write", [field("fileId", "File", "resource"), field("destinationFolderId", "Destination folder", "resource")], { risk: "medium", scopes: ["drive.file"] }),
  action("drive", "share-file", "파일 공유", "write", [field("fileId", "File", "resource"), field("email", "Recipient", "email"), field("role", "Role", "select", { options: [{ label: "Viewer", value: "reader" }, { label: "Editor", value: "writer" }] }), optional("notify", "Notify", "boolean")], { risk: "high", phrase: "SEND", scopes: ["drive.file"] }),
  action("drive", "create-folder", "폴더 생성", "write", [field("name", "Folder name"), optional("parentId", "Parent folder", "resource")], { risk: "low", scopes: ["drive.file"] }),
  action("drive", "search-file", "파일 검색", "read", [field("query", "Query"), optional("folderId", "Folder", "resource"), optional("limit", "Limit", "integer", { min: 1, max: 100 })], { risk: "read", scopes: ["drive.readonly"] })
];

const crm = [
  action("crm", "create-contact", "연락처 생성", "write", [field("name", "Name"), optional("email", "Email", "email"), optional("phone", "Phone"), optional("company", "Company"), optional("tags", "Tags", "array", { itemType: "text" })], { risk: "medium" }),
  action("crm", "update-contact", "연락처 수정", "write", [field("contactId", "Contact", "resource"), optional("name", "Name"), optional("email", "Email", "email"), optional("phone", "Phone"), optional("tags", "Tags", "array", { itemType: "text" })], { risk: "medium" }),
  action("crm", "create-deal", "거래 생성", "write", [field("title", "Title"), field("contactId", "Contact", "resource"), optional("amount", "Amount", "number", { min: 0 }), optional("currency", "Currency"), optional("stage", "Stage", "resource")], { risk: "medium" }),
  action("crm", "update-deal", "거래 수정", "write", [field("dealId", "Deal", "resource"), optional("title", "Title"), optional("amount", "Amount", "number", { min: 0 }), optional("stage", "Stage", "resource")], { risk: "medium" }),
  action("crm", "create-activity", "활동 생성", "write", [field("contactId", "Contact", "resource"), field("type", "Activity type", "select", { options: [{ label: "Call", value: "call" }, { label: "Meeting", value: "meeting" }, { label: "Task", value: "task" }] }), field("title", "Title"), optional("occurredAt", "Occurred at", "datetime")], { risk: "low" }),
  action("crm", "create-note", "메모 생성", "write", [field("contactId", "Contact", "resource"), field("content", "Memo", "textarea")], { risk: "low" }),
  action("crm", "send-email", "이메일 발송", "write", [field("contactId", "Contact", "resource"), field("subject", "Subject"), field("body", "Body", "textarea")], { risk: "medium" }),
  action("crm", "search-contact", "연락처 검색", "read", [field("query", "Query"), optional("tags", "Tags", "array", { itemType: "text" }), optional("limit", "Limit", "integer", { min: 1, max: 100 })], { risk: "read" })
];

const youtube = [
  action("youtube", "upload-video", "영상 업로드", "write", [field("video", "Video", "file"), field("title", "Title"), optional("description", "Description", "textarea"), optional("privacy", "Privacy", "select", { options: [{ label: "Private", value: "private" }, { label: "Unlisted", value: "unlisted" }, { label: "Public", value: "public" }] })], { risk: "high", phrase: "DEPLOY", scopes: ["youtube.upload"], riskRules: [{ field: "privacy", operator: "equals", value: "public", riskLevel: "high", reason: "공개 발행" }] }),
  action("youtube", "update-video", "영상 수정", "write", [field("videoId", "Video", "resource"), optional("title", "Title"), optional("description", "Description", "textarea"), optional("privacy", "Privacy", "select", { options: [{ label: "Private", value: "private" }, { label: "Unlisted", value: "unlisted" }, { label: "Public", value: "public" }] })], { risk: "medium", scopes: ["youtube"] }),
  action("youtube", "set-thumbnail", "썸네일 변경", "write", [field("videoId", "Video", "resource"), field("thumbnail", "Thumbnail", "file")], { risk: "medium", scopes: ["youtube.upload"] }),
  action("youtube", "add-playlist-item", "재생목록 추가", "write", [field("playlistId", "Playlist", "resource"), field("videoId", "Video", "resource"), optional("position", "Position", "integer", { min: 0 })], { risk: "low", scopes: ["youtube"] })
];

const outlook = [
  action("outlook", "send-email", "이메일 보내기", "write", [field("to", "To", "email"), optional("cc", "Cc", "email"), field("subject", "Subject"), field("body", "Body", "textarea"), optional("attachments", "Attachments", "array", { itemType: "file" })], { risk: "medium", scopes: ["Mail.Send"] }),
  action("outlook", "reply-email", "이메일 답장", "write", [field("messageId", "Message", "resource"), field("body", "Body", "textarea")], { risk: "medium", scopes: ["Mail.Send"] }),
  action("outlook", "create-event", "일정 생성", "write", [field("calendarId", "Calendar", "resource"), field("title", "Title"), field("start", "Start", "datetime"), field("end", "End", "datetime"), optional("guests", "Guests", "array", { itemType: "email" })], { risk: "medium", scopes: ["Calendars.ReadWrite"] })
];

const teams = [
  action("microsoft-teams", "send-channel-message", "채널 메시지", "write", [field("teamId", "Team", "resource"), field("channelId", "Channel", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["ChannelMessage.Send"] }),
  action("microsoft-teams", "send-chat-message", "채팅 보내기", "write", [field("chatId", "Chat", "resource"), field("message", "Message", "textarea")], { risk: "medium", scopes: ["ChatMessage.Send"] }),
  action("microsoft-teams", "create-meeting", "회의 생성", "write", [field("subject", "Subject"), field("start", "Start", "datetime"), field("end", "End", "datetime"), optional("attendees", "Attendees", "array", { itemType: "email" })], { risk: "medium", scopes: ["OnlineMeetings.ReadWrite"] })
];

const fileCloud = (appId: string, includeMove: boolean) => [
  action(appId, "upload-file", "파일 업로드", "write", [field("file", "File", "file"), optional("path", "Destination path")], { risk: "medium", scopes: ["files.write"] }),
  action(appId, "download-file", "다운로드", "read", [field("fileId", "File", "resource")], { risk: "read", scopes: ["files.read"] }),
  ...(includeMove ? [action(appId, "move-file", "이동", "write", [field("fileId", "File", "resource"), field("destination", "Destination", "resource")], { risk: "medium", scopes: ["files.write"] })] : []),
  action(appId, "share-file", "공유", "write", [field("fileId", "File", "resource"), field("recipient", "Recipient", "email"), optional("role", "Role", "select", { options: [{ label: "View", value: "view" }, { label: "Edit", value: "edit" }] })], { risk: "high", phrase: "SEND", scopes: ["files.write"] })
];

const records = (appId: string, label: string, idField: string, baseFields: ActionFieldDefinition[]) => [
  action(appId, `create-${label}`, `${display(label)} 생성`, "write", baseFields, { risk: "medium", scopes: ["write"] }),
  action(appId, `update-${label}`, `${display(label)} 수정`, "write", [field(idField, `${display(label)} ID`, "resource"), ...baseFields.map((item) => ({ ...item, required: false }))], { risk: "medium", scopes: ["write"] }),
  action(appId, `delete-${label}`, `${display(label)} 삭제`, "write", [field(idField, `${display(label)} ID`, "resource")], { ...high("DELETE"), scopes: ["write"] }),
  action(appId, `get-${label}`, `${display(label)} 조회`, "read", [field(idField, `${display(label)} ID`, "resource")], { risk: "read", scopes: ["read"] })
];

const airtable = records("airtable", "record", "recordId", [field("baseId", "Base", "resource"), field("tableId", "Table", "resource"), field("fields", "Fields", "json")]).map((item, index) => ({ ...item, name: ["레코드 생성", "레코드 수정", "레코드 삭제", "레코드 조회"][index]! }));

const projectApps = [
  action("trello", "create-card", "카드 생성", "write", [field("boardId", "Board", "resource"), field("listId", "List", "resource"), field("name", "Card name"), optional("description", "Description", "textarea")], { risk: "medium", scopes: ["write"] }),
  action("trello", "move-card", "카드 이동", "write", [field("cardId", "Card", "resource"), field("listId", "Destination list", "resource")], { risk: "medium", scopes: ["write"] }),
  action("trello", "add-comment", "댓글 추가", "write", [field("cardId", "Card", "resource"), field("comment", "Comment", "textarea")], { risk: "medium", scopes: ["write"] }),
  action("asana", "create-task", "작업 생성", "write", [field("projectId", "Project", "resource"), field("name", "Task name"), optional("description", "Description", "textarea"), optional("dueAt", "Due", "datetime")], { risk: "medium", scopes: ["tasks:write"] }),
  action("asana", "complete-task", "작업 완료", "write", [field("taskId", "Task", "resource")], { risk: "medium", scopes: ["tasks:write"] }),
  action("asana", "assign-task", "담당자 지정", "write", [field("taskId", "Task", "resource"), field("assigneeId", "Assignee", "resource")], { risk: "medium", scopes: ["tasks:write"] }),
  ...issueApp("jira", "이슈"),
  ...issueApp("linear", "Issue")
];

const crmProviders = [
  ...createOnlyApp("hubspot", [["contact", "Contact"], ["deal", "Deal"], ["company", "Company"]]),
  ...createOnlyApp("salesforce", [["lead", "Lead"], ["opportunity", "Opportunity"], ["account", "Account"]])
];

const stripe = [
  action("stripe", "create-payment", "결제 생성", "write", [field("amount", "Amount", "number", true, { min: 1 }), field("currency", "Currency"), field("customerId", "Customer", "resource"), optional("description", "Description")], { risk: "critical", phrase: "REFUND", scopes: ["payments:write"], preview: { amountField: "amount" } }),
  action("stripe", "create-customer", "고객 생성", "write", [field("email", "Email", "email"), optional("name", "Name"), optional("metadata", "Metadata", "json")], { risk: "medium", scopes: ["customers:write"] }),
  action("stripe", "refund", "환불", "write", [field("paymentIntentId", "Payment", "resource"), optional("amount", "Amount", "number", { min: 1 }), optional("reason", "Reason")], { ...critical("REFUND"), scopes: ["refunds:write"], preview: { amountField: "amount" } }),
  action("stripe", "cancel-payment", "결제 취소", "write", [field("paymentIntentId", "Payment", "resource"), optional("reason", "Reason")], { ...critical("REFUND"), scopes: ["payments:write"] }),
  action("stripe", "create-subscription", "구독 생성", "write", [field("customerId", "Customer", "resource"), field("priceId", "Price", "resource"), optional("quantity", "Quantity", "integer", { min: 1 })], { risk: "critical", phrase: "SEND", scopes: ["subscriptions:write"] }),
  action("stripe", "cancel-subscription", "구독 취소", "write", [field("subscriptionId", "Subscription", "resource"), optional("atPeriodEnd", "Cancel at period end", "boolean")], { ...critical("REFUND"), scopes: ["subscriptions:write"] })
];

const shopify = [
  action("shopify", "create-product", "상품 생성", "write", [field("title", "Title"), optional("description", "Description", "textarea"), optional("vendor", "Vendor"), optional("variants", "Variants", "json")], { risk: "medium", scopes: ["write_products"] }),
  action("shopify", "update-product", "상품 수정", "write", [field("productId", "Product", "resource"), optional("title", "Title"), optional("description", "Description", "textarea"), optional("status", "Status", "select", { options: [{ label: "Draft", value: "DRAFT" }, { label: "Active", value: "ACTIVE" }] })], { risk: "medium", scopes: ["write_products"] }),
  action("shopify", "create-order", "주문 생성", "write", [field("customerId", "Customer", "resource"), field("lineItems", "Line items", "json"), optional("currency", "Currency")], { risk: "critical", phrase: "SEND", scopes: ["write_orders"] }),
  action("shopify", "cancel-order", "주문 취소", "write", [field("orderId", "Order", "resource"), optional("reason", "Reason"), optional("restock", "Restock", "boolean")], { ...critical("REFUND"), scopes: ["write_orders"] }),
  action("shopify", "update-inventory", "재고 수정", "write", [field("inventoryItemId", "Inventory item", "resource"), field("locationId", "Location", "resource"), field("quantity", "Quantity", "integer")], { risk: "high", phrase: "DEPLOY", scopes: ["write_inventory"] }),
  action("shopify", "refund-order", "Shopify 환불", "write", [field("orderId", "Order", "resource"), field("amount", "Amount", "number", true, { min: 1 }), optional("reason", "Reason")], { ...critical("REFUND"), scopes: ["write_orders"], preview: { amountField: "amount" } })
];

const publishing = [
  ...publishingApp("wordpress", [["create-post", "글 작성"], ["update-post", "글 수정"], ["create-page", "페이지 작성"], ["create-comment", "댓글 작성"]]),
  ...publishingApp("facebook", [["publish-post", "게시물 작성"], ["create-comment", "댓글 작성"]]),
  ...publishingApp("instagram", [["publish-post", "게시물 업로드"], ["publish-reel", "릴스 업로드"], ["publish-story", "스토리 업로드"]]),
  ...publishingApp("x", [["publish-post", "게시글 작성"], ["publish-reply", "답글 작성"]]),
  ...publishingApp("linkedin", [["publish-post", "게시물 작성"], ["publish-organization-post", "회사 게시물 작성"]])
];

const openai = aiActions("openai", ["채팅 생성", "텍스트 요약", "번역", "JSON 생성", "이메일 분석", "문서 분석", "키워드 추출", "감정 분석", "답장 초안 생성"]);
const ai = aiActions("ai", ["이메일 분석", "문서 분석", "텍스트 요약", "감정 분석", "키워드 추출", "JSON 생성", "답장 초안 생성", "OCR 분석", "이미지 설명"]);

const schedule = [
  action("schedule", "once", "한 번 실행", "trigger", [field("startDate", "Start date", "datetime"), optional("timezone", "Timezone", "timezone")], { risk: "read" }),
  action("schedule", "every-minute", "매분", "trigger", [optional("startDate", "Start date", "datetime"), optional("endDate", "End date", "datetime"), optional("timezone", "Timezone", "timezone")], { risk: "read" }),
  action("schedule", "hourly", "매시간", "trigger", [optional("minute", "Minute", "integer", { min: 0, max: 59 }), optional("timezone", "Timezone", "timezone")], { risk: "read", defaults: { minute: 0 } }),
  action("schedule", "daily", "매일", "trigger", [field("time", "Time"), optional("timezone", "Timezone", "timezone"), optional("startDate", "Start date", "date"), optional("endDate", "End date", "date")], { risk: "read" }),
  action("schedule", "weekly", "매주", "trigger", [field("weekday", "Weekday", "select", true, { options: weekdays() }), field("time", "Time"), optional("timezone", "Timezone", "timezone")], { risk: "read" }),
  action("schedule", "monthly", "매월", "trigger", [field("day", "Day", "integer", true, { min: 1, max: 31 }), field("time", "Time"), optional("timezone", "Timezone", "timezone")], { risk: "read" }),
  action("schedule", "cron", "Cron", "trigger", [field("cron", "Cron"), optional("timezone", "Timezone", "timezone"), optional("startDate", "Start date", "datetime"), optional("endDate", "End date", "datetime")], { risk: "read" })
];

const webAndFlow = [
  action("webhook", "receive", "Webhook 수신", "trigger", [optional("secret", "Secret", "text", { secret: true }), optional("allowedMethods", "Methods", "multiselect", { options: methods() })], { risk: "read" }),
  action("webhook", "send", "Webhook 전송", "write", [field("url", "URL", "url"), optional("method", "Method", "select", { options: methods() }), optional("headers", "Headers", "key_value", { advanced: true }), optional("secret", "Secret", "text", { secret: true, advanced: true }), optional("body", "Body", "json")], { risk: "medium", defaults: { method: "POST" } }),
  ...["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => action("http", method.toLowerCase(), method, method === "GET" ? "read" : "write", [field("url", "URL", "url"), optional("headers", "Headers", "key_value", { advanced: true }), optional("query", "Query", "key_value"), ...(method === "GET" ? [] : [optional("body", "Body", "json")]), optional("timeout", "Timeout (ms)", "integer", { min: 100, max: 120000 })], method === "GET" ? { risk: "read", defaults: { timeout: 30000 } } : method === "DELETE" ? { ...high("DELETE"), defaults: { timeout: 30000 } } : { risk: "medium", defaults: { timeout: 30000 } })),
  action("router", "parallel", "병렬 분기", "tool", [optional("maxConcurrency", "Max concurrency", "integer", { min: 1, max: 20 })], { risk: "low", defaults: { maxConcurrency: 4 } }),
  action("router", "conditional", "조건 분기", "tool", [field("path", "Value path", "mapping"), field("routes", "Routes", "json")], { risk: "low" }),
  action("router", "default", "기본 분기", "tool", [optional("label", "Branch label")], { risk: "low" })
];

const codeAndControl = [
  action("code", "javascript", "JavaScript 실행", "tool", [field("code", "Code", "textarea"), optional("input", "Input", "json")], { risk: "medium" }),
  action("code", "typescript", "TypeScript 실행", "tool", [field("code", "Code", "textarea"), optional("input", "Input", "json")], { risk: "medium" }),
  action("delay", "seconds", "초 대기", "tool", [field("seconds", "Seconds", "integer", true, { min: 0, max: 604800 })], { risk: "low" }),
  action("delay", "minutes", "분 대기", "tool", [field("minutes", "Minutes", "integer", true, { min: 0, max: 10080 })], { risk: "low" }),
  action("delay", "hours", "시간 대기", "tool", [field("hours", "Hours", "number", true, { min: 0, max: 168 })], { risk: "low" }),
  action("delay", "until-date", "날짜까지 대기", "tool", [field("until", "Until", "datetime")], { risk: "low" }),
  action("iterator", "array", "배열 반복", "tool", [field("array", "Array", "mapping"), optional("concurrency", "Concurrency", "integer", { min: 1, max: 20 }), optional("limit", "Limit", "integer", { min: 1, max: 1000 })], { risk: "low", defaults: { concurrency: 1, limit: 100 } }),
  action("iterator", "number", "숫자 반복", "tool", [field("count", "Count", "integer", true, { min: 1, max: 1000 }), optional("concurrency", "Concurrency", "integer", { min: 1, max: 20 })], { risk: "low", defaults: { concurrency: 1 } })
];

const transforms = [
  ...unaryTextActions("text-formatter", [["uppercase", "대문자"], ["lowercase", "소문자"], ["trim", "Trim"]]),
  action("text-formatter", "replace", "Replace", "tool", [field("text", "Text", "mapping"), field("search", "Search"), field("replacement", "Replacement")], { risk: "low" }),
  action("text-formatter", "split", "Split", "tool", [field("text", "Text", "mapping"), field("separator", "Separator")], { risk: "low" }),
  action("text-formatter", "join", "Join", "tool", [field("items", "Items", "mapping"), field("separator", "Separator")], { risk: "low" }),
  action("text-formatter", "substring", "Substring", "tool", [field("text", "Text", "mapping"), field("start", "Start", "integer"), optional("length", "Length", "integer", { min: 0 })], { risk: "low" }),
  action("datetime", "now", "현재 시간", "tool", [optional("timezone", "Timezone", "timezone")], { risk: "read" }),
  action("datetime", "format", "날짜 포맷", "tool", [field("value", "Date", "mapping"), field("format", "Format"), optional("timezone", "Timezone", "timezone")], { risk: "low" }),
  action("datetime", "calculate", "시간 계산", "tool", [field("value", "Date", "mapping"), field("amount", "Amount", "number"), field("unit", "Unit", "select", true, { options: timeUnits() })], { risk: "low" }),
  action("datetime", "difference", "날짜 차이", "tool", [field("start", "Start", "mapping"), field("end", "End", "mapping"), optional("unit", "Unit", "select", { options: timeUnits() })], { risk: "low" }),
  ...mathActions(),
  action("json", "parse", "Parse", "tool", [field("text", "JSON text", "mapping")], { risk: "low" }),
  action("json", "stringify", "Stringify", "tool", [field("value", "Value", "mapping"), optional("pretty", "Pretty", "boolean")], { risk: "low" }),
  action("json", "merge", "Merge", "tool", [field("objects", "Objects", "array", true, { itemType: "json" }), optional("deep", "Deep merge", "boolean")], { risk: "low" }),
  action("json", "validate", "Validate", "tool", [field("value", "Value", "mapping"), field("schema", "JSON Schema", "json")], { risk: "read" }),
  action("csv", "read", "CSV 읽기", "tool", [field("csv", "CSV", "mapping"), optional("delimiter", "Delimiter")], { risk: "read", defaults: { delimiter: "," } }),
  action("csv", "create", "CSV 생성", "tool", [field("rows", "Rows", "mapping"), optional("delimiter", "Delimiter"), optional("headers", "Headers", "boolean")], { risk: "low", defaults: { delimiter: ",", headers: true } })
];

const storesAndAggregators = [
  ...aggregatorActions("array-aggregator", [["merge", "배열 병합"], ["group", "그룹화"], ["sum", "합계"], ["average", "평균"]]),
  ...aggregatorActions("text-aggregator", [["concatenate", "텍스트 합치기"], ["markdown", "Markdown 생성"], ["join-lines", "줄바꿈 합치기"]]),
  ...crudTool("variables", "변수"),
  ...crudTool("data-store", "데이터"),
  action("error-handler", "retry", "재시도", "tool", [optional("maxAttempts", "Max attempts", "integer", { min: 1, max: 10 }), optional("backoffSeconds", "Backoff seconds", "integer", { min: 0, max: 3600 })], { risk: "low", defaults: { maxAttempts: 3, backoffSeconds: 5 } }),
  action("error-handler", "ignore", "오류 무시", "tool", [optional("errorCodes", "Error codes", "array", { itemType: "text" })], { risk: "medium" }),
  action("error-handler", "alternate-path", "다른 경로 실행", "tool", [field("route", "Route", "resource"), optional("errorCodes", "Error codes", "array", { itemType: "text" })], { risk: "medium" }),
  action("error-handler", "notify-admin", "관리자 알림", "tool", [field("message", "Message", "textarea"), optional("channels", "Channels", "multiselect", { options: notificationChannels() })], { risk: "medium" }),
  action("error-handler", "stop-workflow", "Workflow 중단", "tool", [optional("reason", "Reason", "textarea")], { risk: "medium" })
];

export const ACTION_CATALOG: ActionDefinition[] = [
  ...gmail,
  ...notion,
  ...sheets,
  ...slack,
  ...calendar,
  ...discord,
  ...telegram,
  ...github,
  ...drive,
  ...crm,
  ...youtube,
  ...outlook,
  ...teams,
  ...fileCloud("onedrive", true),
  ...fileCloud("dropbox", false),
  ...airtable,
  ...projectApps,
  ...crmProviders,
  ...stripe,
  ...shopify,
  ...publishing,
  ...openai,
  ...ai,
  ...schedule,
  ...webAndFlow,
  ...codeAndControl,
  ...transforms,
  ...storesAndAggregators
];

function defaultRisk(kind: ActionKind): ActionRiskLevel {
  if (kind === "trigger" || kind === "read") return "read";
  if (kind === "tool") return "low";
  return "medium";
}

function defaultFailureImpact(risk: ActionRiskLevel) {
  if (risk === "critical") return "금전, 권한 또는 운영 데이터에 중대한 영향이 발생할 수 있습니다.";
  if (risk === "high") return "외부 데이터에 되돌리기 어려운 변경이 발생할 수 있습니다.";
  if (risk === "medium") return "외부 서비스에 생성 또는 수정 작업이 반영되지 않을 수 있습니다.";
  return "현재 단계가 실패하고 후속 단계가 실행되지 않을 수 있습니다.";
}

function outputFor(id: string, kind: ActionKind): ActionOutputField[] {
  if (id.includes("download")) return [{ id: "file", label: "File", type: "file" }];
  if (kind === "trigger") return [{ id: "eventId", label: "Event ID", type: "string" }, { id: "data", label: "Event data", type: "object" }];
  if (kind === "read" || id.startsWith("get-") || id.startsWith("search-") || id.startsWith("query-")) return [{ id: "data", label: "Data", type: "object" }, { id: "items", label: "Items", type: "array", nullable: true }];
  if (kind === "tool") return [{ id: "result", label: "Result", type: "object" }];
  return [{ id: "id", label: "Resource ID", type: "string", nullable: true }, { id: "status", label: "Status", type: "string" }];
}

function display(value: string) {
  return value === "record" ? "레코드" : value.replace(/-/gu, " ");
}

function issueApp(appId: string, noun: string) {
  return [
    action(appId, "create-issue", `${noun} 생성`, "write", [field("projectId", "Project", "resource"), field("title", "Title"), optional("description", "Description", "textarea"), optional("assigneeId", "Assignee", "resource")], { risk: "medium", scopes: ["issues:write"] }),
    action(appId, "update-issue", "수정", "write", [field("issueId", noun, "resource"), optional("title", "Title"), optional("description", "Description", "textarea"), optional("statusId", "Status", "resource")], { risk: "medium", scopes: ["issues:write"] }),
    action(appId, "comment-issue", "댓글", "write", [field("issueId", noun, "resource"), field("comment", "Comment", "textarea")], { risk: "medium", scopes: ["issues:write"] })
  ];
}

function createOnlyApp(appId: string, resources: Array<[string, string]>) {
  return resources.map(([id, label]) => action(appId, `create-${id}`, `${label} 생성`, "write", [field("properties", `${label} properties`, "json")], { risk: "medium", scopes: [`${id}:write`] }));
}

function publishingApp(appId: string, actions: Array<[string, string]>) {
  return actions.map(([id, name]) => action(appId, id, name, "write", [optional("targetId", "Target account/page", "resource"), optional("parentId", "Parent resource", "resource"), field("content", "Content", "textarea"), optional("media", "Media", "array", { itemType: "file" }), optional("visibility", "Visibility", "select", { options: [{ label: "Draft", value: "draft" }, { label: "Private", value: "private" }, { label: "Public", value: "public" }] })], { risk: id.includes("comment") || id.includes("reply") ? "medium" : "high", phrase: id.includes("comment") || id.includes("reply") ? null : "SEND", scopes: ["publish"], riskRules: [{ field: "visibility", operator: "equals", value: "public", riskLevel: "high", reason: "공개 발행" }] }));
}

function aiActions(appId: string, names: string[]) {
  const ids = ["chat", "summarize", "translate", "generate-json", "analyze-email", "analyze-document", "extract-keywords", "analyze-sentiment", "draft-reply"];
  return names.map((name, index) => {
    const id = ids[index] || `analysis-${index + 1}`;
    const definition = action(appId, id, name, "tool", [optional("model", "Model", "resource"), field("input", "Input", "mapping"), optional("prompt", "Prompt", "textarea"), optional("systemPrompt", "System prompt", "textarea", { advanced: true }), optional("temperature", "Temperature", "number", { min: 0, max: 2, advanced: true }), optional("maxTokens", "Max tokens", "integer", { min: 1, max: 100000, advanced: true }), optional("outputFormat", "Output format", "select", { options: [{ label: "Text", value: "text" }, { label: "JSON", value: "json" }] })], { risk: "low", defaults: { temperature: 0.2, outputFormat: id.includes("json") ? "json" : "text" } });
    return {
      ...definition,
      outputSchema: {
        fields: [
          { id: "text", label: "Text", type: "string" as const },
          { id: "data", label: "Structured data", type: "object" as const, nullable: true }
        ]
      }
    };
  });
}

function unaryTextActions(appId: string, actions: Array<[string, string]>) {
  return actions.map(([id, name]) => action(appId, id, name, "tool", [field("text", "Text", "mapping")], { risk: "low" }));
}

function mathActions() {
  return [["add", "더하기"], ["subtract", "빼기"], ["multiply", "곱하기"], ["divide", "나누기"], ["average", "평균"], ["maximum", "최대"], ["minimum", "최소"]].map(([id, name]) => action("math", id!, name!, "tool", [field("values", "Values", "array", true, { itemType: "number" })], { risk: "low" }));
}

function aggregatorActions(appId: string, actions: Array<[string, string]>) {
  return actions.map(([id, name]) => action(appId, id, name, "tool", [field("items", "Items", "mapping"), optional("groupBy", "Group by", "mapping"), optional("separator", "Separator")], { risk: "low" }));
}

function crudTool(appId: string, noun: string) {
  return [
    action(appId, "create", `${noun} 생성`, "tool", [field("key", "Key"), field("value", "Value", "mapping")], { risk: "low" }),
    action(appId, "update", `${noun} 수정`, "tool", [field("key", "Key"), field("value", "Value", "mapping")], { risk: "low" }),
    action(appId, "get", `${noun} 조회`, "tool", [field("key", "Key")], { risk: "read" }),
    action(appId, "delete", `${noun} 삭제`, "tool", [field("key", "Key")], high("DELETE"))
  ];
}

function weekdays() {
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((value) => ({ label: value, value }));
}

function methods() {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => ({ label: value, value }));
}

function timeUnits() {
  return ["seconds", "minutes", "hours", "days", "weeks", "months"].map((value) => ({ label: value, value }));
}

function notificationChannels() {
  return ["in_app", "email", "slack", "browser", "mobile_push"].map((value) => ({ label: value, value }));
}
