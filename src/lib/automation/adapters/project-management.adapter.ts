import { assertPublicDns, assertSafeUrlFormat } from "../../deep-research/safe-fetch";
import { resolveStructuredActionCredential } from "../action-credential.service";
import { adapterImplementationSupports } from "./action-adapter.manifest";
import type { ActionAdapter, ActionAdapterExecutionInput, ActionAdapterExecutionResult } from "./action-adapter.types";
import { compactObject, objectValue, text } from "./adapter-utils";
import { executeJsonRequest } from "./oauth-json-client";

export const projectManagementActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return adapterImplementationSupports("projectManagement", adapterKey, adapterVersion);
  },
  async execute(input) {
    if (!input.connectionId) throw permanent("연결된 프로젝트 관리 계정을 선택하세요.", "CONNECTION_REQUIRED");
    const credential = await resolveStructuredActionCredential(
      input.ownerId,
      input.connectionId,
      input.definition.appId
    );
    if (input.definition.appId === "airtable") return executeAirtable(input, credential.values);
    if (input.definition.appId === "trello") return executeTrello(input, credential.values);
    if (input.definition.appId === "asana") return executeAsana(input, credential.values);
    if (input.definition.appId === "jira") return executeJira(input, credential.values);
    return executeLinear(input, credential.values);
  }
};

function executeAirtable(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const values = input.normalizedInput;
  const recordId = input.definition.id === "create-record" ? "" : `/${segment(text(values, "recordId"))}`;
  const url = `https://api.airtable.com/v0/${segment(text(values, "baseId"))}/${segment(text(values, "tableId"))}${recordId}`;
  const method = input.definition.id === "create-record" ? "POST"
    : input.definition.id === "update-record" ? "PATCH"
      : input.definition.id === "delete-record" ? "DELETE" : "GET";
  return executeJsonRequest(input, {
    url,
    method,
    headers: bearer(credential.personalAccessToken),
    body: method === "POST" || method === "PATCH" ? { fields: objectValue(values, "fields"), typecast: false } : undefined
  });
}

function executeTrello(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  if (!credential.apiKey || !credential.apiToken) throw permanent("Trello API Key와 Token을 확인하세요.", "CREDENTIAL_INVALID");
  const values = input.normalizedInput;
  const query = new URLSearchParams({ key: credential.apiKey, token: credential.apiToken });
  let path = "/cards";
  let method = "POST";
  let body: Record<string, unknown>;
  if (input.definition.id === "create-card") {
    body = compactObject({
      idList: text(values, "listId"),
      name: text(values, "name"),
      desc: text(values, "description") || undefined
    });
  } else if (input.definition.id === "move-card") {
    path = `/cards/${segment(text(values, "cardId"))}`;
    method = "PUT";
    body = { idList: text(values, "listId") };
  } else {
    path = `/cards/${segment(text(values, "cardId"))}/actions/comments`;
    body = { text: text(values, "comment") };
  }
  return executeJsonRequest(input, {
    url: `https://api.trello.com/1${path}?${query.toString()}`,
    method,
    headers: {},
    body
  });
}

function executeAsana(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const values = input.normalizedInput;
  let url = "https://app.asana.com/api/1.0/tasks";
  let method = "POST";
  let data: Record<string, unknown>;
  if (input.definition.id === "create-task") {
    data = compactObject({
      projects: [text(values, "projectId")],
      name: text(values, "name"),
      notes: text(values, "description") || undefined,
      due_at: text(values, "dueAt") || undefined
    });
  } else {
    url += `/${segment(text(values, "taskId"))}`;
    method = "PUT";
    data = input.definition.id === "complete-task"
      ? { completed: true }
      : { assignee: text(values, "assigneeId") };
  }
  return executeJsonRequest(input, {
    url,
    method,
    headers: bearer(credential.personalAccessToken),
    body: { data }
  });
}

async function executeJira(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  const origin = assertSafeUrlFormat(credential.siteUrl).origin;
  const hostname = new URL(origin).hostname.toLowerCase();
  if (!hostname.endsWith(".atlassian.net")) {
    throw permanent("Jira Cloud Site URL은 *.atlassian.net HTTPS 주소여야 합니다.", "CREDENTIAL_INVALID");
  }
  await assertPublicDns(hostname);
  if (!credential.email || !credential.apiToken) throw permanent("Jira 이메일과 API Token을 확인하세요.", "CREDENTIAL_INVALID");
  const values = input.normalizedInput;
  const issueId = segment(text(values, "issueId"));
  const id = input.definition.id;
  const url = id === "create-issue"
    ? `${origin}/rest/api/3/issue`
    : id === "comment-issue"
      ? `${origin}/rest/api/3/issue/${issueId}/comment`
      : `${origin}/rest/api/3/issue/${issueId}`;
  const method = id === "update-issue" ? "PUT" : "POST";
  const body = id === "create-issue"
    ? { fields: compactObject({ project: { key: text(values, "projectId") }, summary: text(values, "title"), description: adf(text(values, "description")), issuetype: { name: "Task" }, assignee: values.assigneeId ? { accountId: text(values, "assigneeId") } : undefined }) }
    : id === "comment-issue"
      ? { body: adf(text(values, "comment")) }
      : { fields: compactObject({ summary: text(values, "title") || undefined, description: values.description ? adf(text(values, "description")) : undefined }) };
  const result = await executeJsonRequest(input, {
    url,
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${credential.email}:${credential.apiToken}`, "utf8").toString("base64")}` },
    body
  });
  if (id === "update-issue" && values.statusId) {
    const transition = await executeJsonRequest(input, {
      url: `${origin}/rest/api/3/issue/${issueId}/transitions`,
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${credential.email}:${credential.apiToken}`, "utf8").toString("base64")}` },
      body: { transition: { id: text(values, "statusId") } }
    });
    return {
      ...transition,
      adapterLatencyMs: (result.adapterLatencyMs || 0) + (transition.adapterLatencyMs || 0)
    };
  }
  return result;
}

async function executeLinear(input: ActionAdapterExecutionInput, credential: Record<string, string>) {
  if (!credential.personalApiKey) throw permanent("Linear Personal API Key를 확인하세요.", "CREDENTIAL_INVALID");
  const values = input.normalizedInput;
  const id = input.definition.id;
  const query = id === "create-issue"
    ? "mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }"
    : id === "update-issue"
      ? "mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title } } }"
      : "mutation CreateComment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id body } } }";
  const variables = id === "create-issue"
    ? { input: compactObject({ teamId: text(values, "projectId"), title: text(values, "title"), description: text(values, "description") || undefined, assigneeId: text(values, "assigneeId") || undefined }) }
    : id === "update-issue"
      ? { id: text(values, "issueId"), input: compactObject({ title: text(values, "title") || undefined, description: text(values, "description") || undefined, stateId: text(values, "statusId") || undefined }) }
      : { input: { issueId: text(values, "issueId"), body: text(values, "comment") } };
  const result = await executeJsonRequest(input, {
    url: "https://api.linear.app/graphql",
    method: "POST",
    headers: { Authorization: credential.personalApiKey },
    body: { query, variables }
  });
  if (Array.isArray(result.output.errors) && result.output.errors.length > 0) {
    throw permanent("Linear GraphQL 요청이 거부되었습니다.");
  }
  return result;
}

function bearer(value: string | undefined) {
  if (!value) throw permanent("Provider credential을 확인하세요.", "CREDENTIAL_INVALID");
  return { Authorization: `Bearer ${value}` };
}

function segment(value: string) {
  if (!value.trim()) throw permanent("필수 리소스 ID가 비어 있습니다.", "ACTION_INPUT_INVALID");
  return encodeURIComponent(value.trim());
}

function adf(value: string) {
  return { type: "doc", version: 1, content: [{ type: "paragraph", content: value ? [{ type: "text", text: value }] : [] }] };
}

function permanent(message: string, code = "ACTION_FAILED") {
  return Object.assign(new Error(message), { code, retryable: false });
}
