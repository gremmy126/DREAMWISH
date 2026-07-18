import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { arrayValue, booleanValue, compactObject, objectValue, text } from "./adapter-utils";
import { executeOAuthJson } from "./oauth-json-client";

export const collaborationActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("collaboration", adapterKey, adapterVersion);
  },
  execute(input) {
    if (input.definition.appId === "slack") return executeSlack(input);
    if (input.definition.appId === "github") return executeGitHub(input);
    return executeNotion(input);
  }
};

async function executeSlack(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const id = input.definition.id;
  if (id === "send-direct-message") {
    const opened = await slack(input, "conversations.open", { users: text(values, "userId"), return_im: true });
    const channel = String(((opened.output.channel as Record<string, unknown> | undefined)?.id) || "");
    if (!channel) throw new Error("Slack did not return a direct-message channel.");
    return slack(input, "chat.postMessage", { channel, text: text(values, "message"), client_msg_id: input.idempotencyKey });
  }
  if (id === "send-channel-message") return slack(input, "chat.postMessage", compactObject({ channel: text(values, "channel"), text: text(values, "message"), blocks: values.blocks || undefined, client_msg_id: input.idempotencyKey }));
  if (id === "reply-thread") return slack(input, "chat.postMessage", { channel: text(values, "channel"), text: text(values, "message"), thread_ts: text(values, "threadTs"), client_msg_id: input.idempotencyKey });
  if (id === "add-reaction") return slack(input, "reactions.add", { channel: text(values, "channel"), timestamp: text(values, "timestamp"), name: text(values, "emoji").replace(/^:|:$/gu, "") });
  if (id === "create-channel") return slack(input, "conversations.create", { name: text(values, "name"), is_private: booleanValue(values, "private") });
  return slack(input, "users.info", { user: text(values, "userId") });
}

async function slack(input: ActionAdapterExecutionInput, method: string, body: unknown) {
  const result = await executeOAuthJson(input, { url: `https://slack.com/api/${method}`, method: "POST", body });
  if (result.output.ok === false) throw Object.assign(new Error(`Slack API rejected ${method}.`), { code: "ACTION_FAILED", retryable: false });
  return result;
}

function executeGitHub(input: ActionAdapterExecutionInput): Promise<ActionAdapterExecutionResult> {
  const values = input.normalizedInput;
  const repository = githubRepository(text(values, "repository"));
  const base = `https://api.github.com/repos/${repository}`;
  const id = input.definition.id;
  const github = (path: string, method = "POST", body?: unknown) => executeOAuthJson(input, {
    url: `${base}${path}`, method, body,
    headers: { "X-GitHub-Api-Version": "2022-11-28" }
  });
  if (id === "create-issue") return github("/issues", "POST", compactObject({ title: text(values, "title"), body: values.body ? text(values, "body") : undefined, labels: arrayValue(values, "labels"), assignees: arrayValue(values, "assignees") }));
  if (id === "update-issue") return github(`/issues/${text(values, "issueNumber")}`, "PATCH", compactObject({ title: values.title ? text(values, "title") : undefined, body: values.body ? text(values, "body") : undefined, state: values.state ? text(values, "state") : undefined }));
  if (id === "comment-issue") return github(`/issues/${text(values, "issueNumber")}/comments`, "POST", { body: text(values, "body") });
  if (id === "create-pull-request") return github("/pulls", "POST", compactObject({ title: text(values, "title"), head: text(values, "head"), base: text(values, "base"), body: values.body ? text(values, "body") : undefined, draft: booleanValue(values, "draft") }));
  if (id === "comment-pull-request") return github(`/issues/${text(values, "pullNumber")}/comments`, "POST", { body: text(values, "body") });
  if (id === "delete-branch") return github(`/git/refs/heads/${encodeURIComponent(text(values, "branch"))}`, "DELETE");
  if (id === "dispatch-workflow") return github(`/actions/workflows/${encodeURIComponent(text(values, "workflowId"))}/dispatches`, "POST", compactObject({ ref: text(values, "ref"), inputs: values.inputs || undefined }));
  if (id === "create-release") return github("/releases", "POST", compactObject({ tag_name: text(values, "tag"), target_commitish: values.target ? text(values, "target") : undefined, name: text(values, "name"), body: values.body ? text(values, "body") : undefined, prerelease: booleanValue(values, "prerelease") }));
  if (id === "create-branch") return createGitHubBranch(input, github);
  const path = `/contents/${text(values, "path").split("/").map(encodeURIComponent).join("/")}`;
  if (id === "delete-file") return github(path, "DELETE", { message: text(values, "message"), sha: text(values, "sha"), branch: text(values, "branch") });
  return github(path, "PUT", compactObject({ message: text(values, "message"), content: Buffer.from(text(values, "content"), "utf8").toString("base64"), branch: text(values, "branch"), sha: values.sha ? text(values, "sha") : undefined }));
}

async function createGitHubBranch(input: ActionAdapterExecutionInput, github: (path: string, method?: string, body?: unknown) => Promise<ActionAdapterExecutionResult>) {
  const source = await github(`/git/ref/${normalizeGitRef(text(input.normalizedInput, "fromRef"))}`, "GET");
  const sha = String((((source.output.object as Record<string, unknown> | undefined) || {}).sha) || "");
  if (!sha) throw new Error("GitHub source reference did not return a commit SHA.");
  return github("/git/refs", "POST", { ref: `refs/heads/${text(input.normalizedInput, "branch")}`, sha });
}

function executeNotion(input: ActionAdapterExecutionInput) {
  const values = input.normalizedInput;
  const id = input.definition.id;
  const notion = (path: string, method = "GET", body?: unknown) => executeOAuthJson(input, { url: `https://api.notion.com/v1${path}`, method, body, headers: { "Notion-Version": "2026-03-11" } });
  if (id === "query-database") return notion(`/databases/${encodeURIComponent(text(values, "databaseId"))}/query`, "POST", compactObject({ filter: values.filter || undefined, sorts: values.sorts || undefined, page_size: values.pageSize || undefined }));
  if (id === "get-page") return notion(`/pages/${encodeURIComponent(text(values, "pageId"))}`);
  if (id === "search-page") return notion("/search", "POST", compactObject({ query: values.query ? text(values, "query") : undefined, page_size: values.pageSize || undefined, sort: values.sortDirection ? { direction: text(values, "sortDirection"), timestamp: "last_edited_time" } : undefined }));
  if (id === "create-database-item") return notion("/pages", "POST", compactObject({ parent: { database_id: text(values, "databaseId") }, properties: objectValue(values, "properties"), children: values.content ? paragraphChildren(text(values, "content")) : undefined, icon: values.icon ? { type: "external", external: { url: text(values, "icon") } } : undefined, cover: values.cover ? { type: "external", external: { url: text(values, "cover") } } : undefined }));
  if (id === "update-database-item" || id === "update-page") return notion(`/pages/${encodeURIComponent(text(values, "pageId"))}`, "PATCH", compactObject({ properties: objectValue(values, "properties"), archived: values.archived }));
  if (id === "create-page") return notion("/pages", "POST", compactObject({ parent: { page_id: text(values, "parentId") }, properties: Object.keys(objectValue(values, "properties")).length ? objectValue(values, "properties") : { title: { type: "title", title: [{ type: "text", text: { content: text(values, "title") } }] } }, children: values.content ? paragraphChildren(text(values, "content")) : undefined }));
  if (id === "append-block") return notion(`/blocks/${encodeURIComponent(text(values, "parentBlockId"))}/children`, "PATCH", { children: values.children });
  if (id === "update-block") return notion(`/blocks/${encodeURIComponent(text(values, "blockId"))}`, "PATCH", objectValue(values, "content"));
  return notion("/comments", "POST", { parent: { page_id: text(values, "pageId") }, rich_text: [{ type: "text", text: { content: text(values, "comment") } }] });
}

function githubRepository(value: string) { if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) throw new Error("GitHub repository must be owner/name."); return value.split("/").map(encodeURIComponent).join("/"); }
function normalizeGitRef(value: string) { return value.replace(/^refs\//u, "").split("/").map(encodeURIComponent).join("/"); }
function paragraphChildren(content: string) { return content.split(/\r?\n/u).filter(Boolean).map((line) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: line } }] } })); }
