import { createAuditLogEntry, recordAuditLogEntry } from "../security/audit-log";
import {
  callOutboundWebhook,
  createGitHubIssue,
  createNotionPage,
  sendDiscordWebhook,
  sendGmailMessage,
  sendSlackMessage,
  type OutboundSendResult
} from "../business/outbound-send.service";
import { getAutomationRun, updateAutomationRun, type AutomationRun } from "./run.repository";
import { getScenario } from "./scenario.repository";
import type { ScenarioNode } from "./scenario-designer";

export type PlannedExternalAction = {
  nodeId: string;
  label: string;
  app: string;
  kind:
    | "gmail_send"
    | "slack_send"
    | "github_issue"
    | "notion_page"
    | "webhook_call"
    | "discord_webhook"
    | "unsupported";
  /** Safe, human-readable preview of exactly what will be sent. */
  preview: string;
  /** Missing required config fields, if any — such steps cannot execute. */
  missing: string[];
};

export type RunApprovalPreview = {
  runId: string;
  scenarioName: string;
  actions: PlannedExternalAction[];
};

export type ApprovalSendDeps = {
  sendGmail?: typeof sendGmailMessage;
  sendSlack?: typeof sendSlackMessage;
  createGitHubIssue?: typeof createGitHubIssue;
  createNotionPage?: typeof createNotionPage;
  callWebhook?: typeof callOutboundWebhook;
  sendDiscordWebhook?: typeof sendDiscordWebhook;
};

/**
 * Builds the approval preview for a run's pending external steps. The user
 * sees the exact recipient/channel and content before anything is sent.
 */
export async function buildRunApprovalPreview(
  ownerId: string,
  runId: string
): Promise<RunApprovalPreview | null> {
  const run = await getAutomationRun(ownerId, runId);
  if (!run) return null;
  const scenario = await getScenario(ownerId, run.scenarioId);
  const actions = run.steps
    .filter((step) => step.status === "approval_required")
    .map((step) => {
      const node = scenario?.nodes.find((candidate) => candidate.id === step.nodeId) || null;
      return planExternalAction(step.nodeId, step.label, node, step.resolvedConfig);
    });
  return { runId: run.id, scenarioName: run.scenarioName, actions };
}

/**
 * Executes the approved external steps of a run: supported sends go out with
 * the owner's OAuth tokens, unsupported apps are skipped explicitly, and the
 * run record plus audit log capture what actually happened.
 */
export async function approveAndExecuteRun(
  ownerId: string,
  runId: string,
  deps: ApprovalSendDeps = {}
): Promise<AutomationRun | null> {
  const run = await getAutomationRun(ownerId, runId);
  if (!run) return null;
  const scenario = await getScenario(ownerId, run.scenarioId);
  const sendGmail = deps.sendGmail || sendGmailMessage;
  const sendSlack = deps.sendSlack || sendSlackMessage;

  const outcomes = new Map<string, { status: "success" | "failed" | "skipped"; detail: string }>();
  for (const step of run.steps) {
    if (step.status !== "approval_required") continue;
    const node = scenario?.nodes.find((candidate) => candidate.id === step.nodeId) || null;
    const plan = planExternalAction(step.nodeId, step.label, node, step.resolvedConfig);

    if (plan.missing.length > 0) {
      outcomes.set(step.nodeId, {
        status: "failed",
        detail: `실행에 필요한 설정이 없습니다: ${plan.missing.join(", ")}`
      });
      continue;
    }
    if (plan.kind === "unsupported") {
      outcomes.set(step.nodeId, {
        status: "skipped",
        detail: "이 앱의 자동 발송은 아직 지원되지 않습니다. 수동으로 실행하세요."
      });
      continue;
    }

    let result: OutboundSendResult;
    const config = step.resolvedConfig || node?.config || {};
    if (plan.kind === "gmail_send") {
      result = await sendGmail(ownerId, {
        to: String(config.to || ""),
        subject: String(config.subject || "DREAMWISH 자동화 알림"),
        body: String(config.body || config.message || "")
      });
    } else if (plan.kind === "slack_send") {
      result = await sendSlack(ownerId, {
        channel: String(config.channel || ""),
        text: String(config.message || config.text || "")
      });
    } else if (plan.kind === "github_issue") {
      result = await (deps.createGitHubIssue || createGitHubIssue)(ownerId, {
        repo: String(config.repo || ""),
        title: String(config.title || config.subject || "DREAMWISH 자동화 이슈"),
        body: String(config.body || config.message || "")
      });
    } else if (plan.kind === "notion_page") {
      result = await (deps.createNotionPage || createNotionPage)(ownerId, {
        parentPageId: String(config.parentPageId || config.pageId || ""),
        title: String(config.title || config.subject || "DREAMWISH 자동화 페이지"),
        content: String(config.content || config.body || config.message || "")
      });
    } else if (plan.kind === "discord_webhook") {
      result = await (deps.sendDiscordWebhook || sendDiscordWebhook)({
        webhookUrl: String(config.webhookUrl || config.url || ""),
        content: String(config.message || config.content || "")
      });
    } else {
      result = await (deps.callWebhook || callOutboundWebhook)({
        url: String(config.url || config.webhookUrl || ""),
        payload: String(config.payload || config.body || config.message || "")
      });
    }
    outcomes.set(
      step.nodeId,
      result.ok
        ? { status: "success", detail: "승인 후 실제 발송이 완료되었습니다." }
        : { status: "failed", detail: result.error }
    );
  }

  const updated = await updateAutomationRun(ownerId, runId, (record) => {
    for (const step of record.steps) {
      const outcome = outcomes.get(step.nodeId);
      if (step.status === "approval_required" && outcome) {
        step.status = outcome.status;
        step.detail = outcome.detail;
      }
    }
    const failed = record.steps.some((step) => step.status === "failed");
    const pending = record.steps.some(
      (step) => step.status === "approval_required" || step.status === "skipped"
    );
    record.status = failed ? "failed" : pending ? "partial" : "success";
  });

  await recordAuditLogEntry(
    createAuditLogEntry("automation.run.approved", runId, {
      ownerId,
      scenarioId: run.scenarioId,
      approvedSteps: [...outcomes.keys()].length,
      results: [...outcomes.entries()].map(([nodeId, outcome]) => ({
        nodeId,
        status: outcome.status
      }))
    })
  ).catch(() => undefined);

  return updated;
}

function planExternalAction(
  nodeId: string,
  label: string,
  node: ScenarioNode | null,
  resolvedConfig?: Record<string, string | number | boolean>
): PlannedExternalAction {
  const config = resolvedConfig || node?.config || {};
  const app = node?.appId || "unknown";

  if (app === "gmail") {
    const to = String(config.to || "").trim();
    const body = String(config.body || config.message || "").trim();
    const missing = [...(to ? [] : ["to (받는 사람)"]), ...(body ? [] : ["body (본문)"])];
    return {
      nodeId,
      label,
      app,
      kind: "gmail_send",
      missing,
      preview: to
        ? `Gmail → ${to} · 제목 "${String(config.subject || "DREAMWISH 자동화 알림")}" · ${truncate(body, 80)}`
        : "받는 사람이 설정되지 않았습니다."
    };
  }
  if (app === "slack") {
    const channel = String(config.channel || "").trim();
    const text = String(config.message || config.text || "").trim();
    const missing = [...(channel ? [] : ["channel (채널)"]), ...(text ? [] : ["message (내용)"])];
    return {
      nodeId,
      label,
      app,
      kind: "slack_send",
      missing,
      preview: channel ? `Slack → #${channel} · ${truncate(text, 80)}` : "채널이 설정되지 않았습니다."
    };
  }
  if (app === "github") {
    const repo = String(config.repo || "").trim();
    const title = String(config.title || config.subject || "").trim();
    const missing = [...(repo ? [] : ["repo (owner/repo)"]), ...(title ? [] : ["title (제목)"])];
    return {
      nodeId,
      label,
      app,
      kind: "github_issue",
      missing,
      preview: repo
        ? `GitHub 이슈 → ${repo} · "${truncate(title, 60)}"`
        : "저장소(owner/repo)가 설정되지 않았습니다."
    };
  }
  if (app === "notion") {
    const parentPageId = String(config.parentPageId || config.pageId || "").trim();
    const title = String(config.title || config.subject || "").trim();
    const missing = [
      ...(parentPageId ? [] : ["parentPageId (상위 페이지 ID)"]),
      ...(title ? [] : ["title (제목)"])
    ];
    return {
      nodeId,
      label,
      app,
      kind: "notion_page",
      missing,
      preview: parentPageId
        ? `Notion 페이지 생성 → ${truncate(parentPageId, 20)} 하위 · "${truncate(title, 60)}"`
        : "상위 페이지 ID가 설정되지 않았습니다."
    };
  }
  if (app === "discord") {
    const webhookUrl = String(config.webhookUrl || config.url || "").trim();
    const content = String(config.message || config.content || "").trim();
    const missing = [
      ...(webhookUrl ? [] : ["webhookUrl (디스코드 웹훅 URL)"]),
      ...(content ? [] : ["message (내용)"])
    ];
    return {
      nodeId,
      label,
      app,
      kind: "discord_webhook",
      missing,
      preview: webhookUrl
        ? `Discord 웹훅 → ${truncate(content, 80)}`
        : "웹훅 URL이 설정되지 않았습니다."
    };
  }
  if (app === "webhook") {
    const url = String(config.url || config.webhookUrl || "").trim();
    const payload = String(config.payload || config.body || config.message || "").trim();
    const missing = [...(url ? [] : ["url (호출 주소)"])];
    return {
      nodeId,
      label,
      app,
      kind: "webhook_call",
      missing,
      preview: url
        ? `Webhook POST → ${truncate(url, 60)} · ${truncate(payload || "{}", 50)}`
        : "호출할 URL이 설정되지 않았습니다."
    };
  }
  return {
    nodeId,
    label,
    app,
    kind: "unsupported",
    missing: [],
    preview: `${app} 앱의 자동 발송은 아직 지원되지 않아 승인 시 건너뜁니다.`
  };
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value || "(내용 없음)";
}
