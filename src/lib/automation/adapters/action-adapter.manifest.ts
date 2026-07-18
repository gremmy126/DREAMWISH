type AdapterImplementationManifest = {
  readonly version: number;
  readonly keys: ReadonlySet<string>;
};

const ADAPTER_IMPLEMENTATIONS = {
  trigger: implementation([
    "gmail.watch-new-email",
    "webhook.receive",
    ...actionKeys({
      schedule: ["once", "every-minute", "hourly", "daily", "weekly", "monthly", "cron"]
    })
  ]),
  ai: implementation(actionKeys({
    ai: ["chat", "summarize", "translate", "generate-json", "analyze-email", "analyze-document", "extract-keywords", "analyze-sentiment", "draft-reply"],
    openai: ["chat", "summarize", "translate", "generate-json", "analyze-email", "analyze-document", "extract-keywords", "analyze-sentiment", "draft-reply"]
  })),
  google: implementation(actionKeys({
    gmail: ["watch-new-email", "send-email", "reply-email", "forward-email", "create-draft", "permanently-delete-email", "mark-read", "mark-unread", "archive-email", "add-label", "remove-label", "download-attachment", "save-attachment", "search-email"],
    "google-sheets": ["add-row", "update-row", "delete-row", "get-row", "create-sheet", "get-sheet"],
    calendar: ["create-event", "update-event", "delete-event", "get-events"],
    drive: ["upload-file", "download-file", "move-file", "share-file", "create-folder", "search-file"],
    youtube: ["upload-video", "update-video", "set-thumbnail", "add-playlist-item"]
  })),
  collaboration: implementation(actionKeys({
    slack: ["send-channel-message", "send-direct-message", "reply-thread", "add-reaction", "create-channel", "get-user"],
    notion: ["create-database-item", "update-database-item", "query-database", "create-page", "update-page", "get-page", "append-block", "update-block", "create-comment", "search-page"],
    github: ["create-issue", "update-issue", "comment-issue", "create-pull-request", "comment-pull-request", "create-branch", "delete-branch", "create-file", "update-file", "delete-file", "dispatch-workflow", "create-release"]
  })),
  projectManagement: implementation([
    "airtable.create-record", "airtable.update-record", "airtable.delete-record", "airtable.get-record",
    "trello.create-card", "trello.move-card", "trello.add-comment",
    "asana.create-task", "asana.complete-task", "asana.assign-task",
    "jira.create-issue", "jira.update-issue", "jira.comment-issue",
    "linear.create-issue", "linear.update-issue", "linear.comment-issue"
  ]),
  crmCommerce: implementation([
    "crm.create-contact", "crm.update-contact", "crm.create-deal", "crm.update-deal",
    "crm.create-activity", "crm.create-note", "crm.send-email", "crm.search-contact",
    "hubspot.create-contact", "hubspot.create-deal", "hubspot.create-company",
    "salesforce.create-lead", "salesforce.create-opportunity", "salesforce.create-account",
    "stripe.create-payment", "stripe.create-customer", "stripe.refund", "stripe.cancel-payment",
    "stripe.create-subscription", "stripe.cancel-subscription",
    "shopify.create-product", "shopify.update-product", "shopify.create-order",
    "shopify.cancel-order", "shopify.update-inventory"
  ]),
  publishing: implementation([
    "wordpress.create-post", "wordpress.update-post", "wordpress.create-page", "wordpress.create-comment",
    "facebook.publish-post", "facebook.create-comment", "instagram.publish-post",
    "x.publish-post", "x.publish-reply",
    "linkedin.publish-post", "linkedin.publish-organization-post"
  ]),
  microsoft: implementation([
    "outlook.send-email", "outlook.reply-email", "outlook.create-event",
    "microsoft-teams.send-channel-message", "microsoft-teams.send-chat-message", "microsoft-teams.create-meeting",
    "onedrive.upload-file", "onedrive.download-file", "onedrive.move-file", "onedrive.share-file"
  ]),
  messaging: implementation([
    "discord.send-channel-message", "discord.send-direct-message", "discord.add-role", "discord.remove-role", "discord.create-channel", "discord.create-thread",
    "telegram.send-message", "telegram.send-photo", "telegram.send-document", "telegram.send-file"
  ]),
  dropbox: implementation([
    "dropbox.upload-file", "dropbox.download-file", "dropbox.share-file"
  ]),
  publicHttp: implementation([
    "webhook.send", "http.get", "http.post", "http.put", "http.patch", "http.delete"
  ]),
  localTool: implementation(actionKeys({
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
  }))
} as const satisfies Record<string, AdapterImplementationManifest>;

export type ActionAdapterImplementationId = keyof typeof ADAPTER_IMPLEMENTATIONS;

const IMPLEMENTED_IDENTITIES = new Set(
  Object.values(ADAPTER_IMPLEMENTATIONS).flatMap(({ version, keys }) =>
    [...keys].map((adapterKey) => identity(adapterKey, version))
  )
);

export function adapterImplementationSupports(
  implementationId: ActionAdapterImplementationId,
  adapterKey: string,
  adapterVersion: number
) {
  const implementation = ADAPTER_IMPLEMENTATIONS[implementationId];
  return implementation.version === adapterVersion && implementation.keys.has(adapterKey);
}

export function isManifestAdapterImplementationAvailable(adapterKey: string, adapterVersion: number) {
  return IMPLEMENTED_IDENTITIES.has(identity(adapterKey, adapterVersion));
}

export function listManifestAdapterKeys() {
  return [...IMPLEMENTED_IDENTITIES].sort();
}

function implementation(keys: readonly string[], version = 1): AdapterImplementationManifest {
  return Object.freeze({ version, keys: new Set(keys) });
}

function actionKeys(input: Readonly<Record<string, readonly string[]>>) {
  return Object.entries(input).flatMap(([appId, actionIds]) =>
    actionIds.map((actionId) => `${appId}.${actionId}`)
  );
}

function identity(adapterKey: string, adapterVersion: number) {
  return `${adapterKey}@${adapterVersion}`;
}
