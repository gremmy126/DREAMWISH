const IMPLEMENTED_ACTIONS: Record<string, readonly string[]> = {
  ai: ["chat", "summarize", "translate", "generate-json", "analyze-email", "analyze-document", "extract-keywords", "analyze-sentiment", "draft-reply", "analysis-8", "analysis-9"],
  openai: ["chat", "summarize", "translate", "generate-json", "analyze-email", "analyze-document", "extract-keywords", "analyze-sentiment", "draft-reply"],
  gmail: ["watch-new-email", "send-email", "reply-email", "create-draft", "permanently-delete-email", "mark-read", "mark-unread", "archive-email", "add-label", "remove-label", "download-attachment", "search-email"],
  "google-sheets": ["add-row", "update-row", "delete-row", "get-row", "create-sheet", "get-sheet"],
  slack: ["send-channel-message", "send-direct-message", "reply-thread", "add-reaction", "create-channel", "get-user"],
  notion: ["create-database-item", "update-database-item", "query-database", "create-page", "update-page", "get-page", "append-block", "update-block", "create-comment", "search-page"],
  calendar: ["create-event", "update-event", "delete-event", "get-events"],
  github: ["create-issue", "update-issue", "comment-issue", "create-pull-request", "comment-pull-request", "create-branch", "delete-branch", "create-file", "update-file", "delete-file", "dispatch-workflow", "create-release"],
  drive: ["move-file", "share-file", "create-folder", "search-file"],
  youtube: ["update-video", "add-playlist-item"],
  discord: ["send-channel-message", "send-direct-message", "add-role", "remove-role", "create-channel", "create-thread"],
  telegram: ["send-message", "send-photo", "send-document", "send-file"],
  outlook: ["send-email", "reply-email", "create-event"],
  "microsoft-teams": ["send-channel-message", "send-chat-message", "create-meeting"],
  onedrive: ["move-file", "share-file"],
  dropbox: ["share-file"],
  schedule: ["once", "every-minute", "hourly", "daily", "weekly", "monthly", "cron"],
  webhook: ["receive", "send"],
  http: ["get", "post", "put", "patch", "delete"],
  "text-formatter": ["uppercase", "lowercase", "trim", "replace", "split", "join", "substring"],
  datetime: ["now", "format", "calculate", "difference"],
  math: ["add", "subtract", "multiply", "divide", "average", "maximum", "minimum"],
  json: ["parse", "stringify", "merge", "validate"],
  csv: ["read", "create"],
  "array-aggregator": ["merge", "group", "sum", "average"],
  "text-aggregator": ["concatenate", "markdown", "join-lines"],
  router: ["parallel", "conditional", "default"],
  delay: ["seconds", "minutes", "hours", "until-date"],
  iterator: ["array", "number"]
};

const IMPLEMENTED_KEYS = new Set(
  Object.entries(IMPLEMENTED_ACTIONS).flatMap(([appId, actionIds]) =>
    actionIds.map((actionId) => `${appId}.${actionId}@1`)
  )
);

export function isAdapterImplementationAvailable(adapterKey: string, adapterVersion: number) {
  return IMPLEMENTED_KEYS.has(`${adapterKey}@${adapterVersion}`);
}

export function listImplementedAdapterKeys() {
  return [...IMPLEMENTED_KEYS].sort();
}
