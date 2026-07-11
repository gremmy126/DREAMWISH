import { createAutomationDraft, listAutomations } from "@/src/lib/automation/automation.repository";
import {
  createCalendarEvent,
  listCalendarItems
} from "@/src/lib/calendar/calendar.repository";
import { createCustomerDraft, listCustomers } from "@/src/lib/crm/crm.repository";
import { saveFileRecord, listFileRecords } from "@/src/lib/files/file.repository";
import {
  saveIntegrationSyncSetting,
  listIntegrationSyncSettings,
  listEnabledIntegrationApps
} from "@/src/lib/integrations/integration-settings.repository";
import { createKnowledgeNote, listKnowledgeNotes } from "@/src/lib/knowledge/knowledge.repository";
import { createProject, assignSessionToProject, listProjects } from "@/src/lib/projects/project.repository";
import {
  createWorkflowWorkspace,
  listWorkflowWorkspaces
} from "@/src/lib/workflow/workflow.repository";

async function assertStage10WorkspaceContracts() {
  const ownerId = "stage10-contract-owner";
  const customer = await createCustomerDraft({
    name: "김민수",
    email: "minsu@example.com",
    phone: "010-0000-0000",
    companyName: "DREAMWISH 고객사",
    position: "대표",
    memo: "직접 입력한 고객"
  });
  if (customer.status !== "lead") throw new Error("Customer drafts must start as lead");
  (await listCustomers()).length satisfies number;

  const workflow = await createWorkflowWorkspace({
    name: "고객 온보딩",
    description: "승인 기반 업무 흐름",
    triggerType: "manual"
  });
  if (workflow.status !== "draft") throw new Error("Workflow workspaces must start as draft");
  (await listWorkflowWorkspaces()).length satisfies number;

  const automation = await createAutomationDraft({
    name: "계약 후속 알림",
    trigger: "계약 상태 변경",
    action: "Gmail 초안 생성"
  });
  if (automation.status !== "paused") {
    throw new Error("Automation drafts must start paused");
  }
  (await listAutomations()).length satisfies number;

  const event = await createCalendarEvent({
    title: "고객 미팅",
    startsAt: "2026-07-09T10:00:00.000Z",
    endsAt: "2026-07-09T11:00:00.000Z",
    description: "캘린더 직접 생성",
    source: "manual"
  });
  event.source satisfies "manual" | "google";
  (await listCalendarItems()).length satisfies number;

  const file = await saveFileRecord({
    ownerId,
    name: "proposal.md",
    mimeType: "text/markdown",
    size: 128,
    source: "aichat",
    textPreview: "첨부 파일 내용",
    projectId: null
  });
  file.source satisfies "aichat" | "files" | "knowledge";
  (await listFileRecords(ownerId)).length satisfies number;

  const note = await createKnowledgeNote({
    ownerId,
    title: "고객 요구사항",
    body: "프로젝트 지식",
    tags: ["crm"],
    projectId: null,
    sourceFileId: file.id
  });
  note.sourceFileId satisfies string | null;
  (await listKnowledgeNotes(ownerId)).length satisfies number;

  await saveIntegrationSyncSetting({
    connectorId: "gmail",
    enabled: true,
    syncDays: 30,
    commandPrefix: "Gmail"
  });
  const enabledApps = await listEnabledIntegrationApps();
  enabledApps[0].connectorId satisfies string;
  (await listIntegrationSyncSettings()).length satisfies number;

  const project = await createProject({ ownerId, name: "AI Workspace" });
  await assignSessionToProject({ ownerId, projectId: project.id, sessionId: "session_1" });
  (await listProjects(ownerId)).length satisfies number;
}

void assertStage10WorkspaceContracts;
