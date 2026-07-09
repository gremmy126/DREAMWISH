import type { AutomationRecord } from "./automation.repository";

export type AutomationDraftInput = {
  name: string;
  trigger: string;
  action: string;
};

export type AutomationDraftTemplate = AutomationDraftInput & {
  triggerHelp: string;
  actionHelp: string;
  previewSteps: string[];
  safetyLevel: "low" | "medium" | "high";
};

export const triggerExamples = [
  {
    label: "Customer status changes",
    value: "When a CRM customer status changes to active",
    description: "Use this for follow-up, onboarding, renewal, and handoff flows."
  },
  {
    label: "New memory approved",
    value: "When a memory candidate is approved",
    description: "Use this when approved context should update projects or documents."
  },
  {
    label: "Calendar event starts soon",
    value: "30 minutes before a calendar event starts",
    description: "Use this for meeting briefs, reminders, and preparation tasks."
  }
] as const;

export const actionExamples = [
  {
    label: "Create draft",
    value: "Create a Gmail draft and wait for approval",
    description: "Safe for external communication because it does not send automatically."
  },
  {
    label: "Add task",
    value: "Create a task in the AI Chat action list",
    description: "Use this for local follow-up without external API calls."
  },
  {
    label: "Update memory",
    value: "Create a memory candidate for user approval",
    description: "Keeps memory changes approval-first and undoable."
  }
] as const;

export function buildAutomationDraftTemplate(
  input: AutomationDraftInput
): AutomationDraftTemplate {
  const trigger = input.trigger.trim();
  const action = input.action.trim();
  const writesExternally = /send|slack|gmail|calendar|webhook|post|delete|update/iu.test(
    action
  );

  return {
    name: input.name.trim() || "Untitled automation",
    trigger,
    action,
    triggerHelp:
      "Describe the event that starts the automation, for example a CRM status change, approved memory, new file, or upcoming calendar event.",
    actionHelp:
      "Describe the safe next step. External writes should create a preview or draft first and wait for approval before execution.",
    previewSteps: [
      "Planner parses the trigger and action.",
      "Permission check classifies external reads and writes.",
      writesExternally
        ? "Execution preview is shown and waits for approval."
        : "Local action is queued and recorded in history.",
      "Memory and execution history are updated after the run."
    ],
    safetyLevel: writesExternally ? "high" : trigger && action ? "medium" : "low"
  };
}

export function describeAutomation(record: AutomationRecord) {
  return buildAutomationDraftTemplate({
    name: record.name,
    trigger: record.trigger,
    action: record.action
  });
}
