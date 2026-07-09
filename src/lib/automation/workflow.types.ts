export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

export type WorkflowTrigger = {
  type: string;
  label: string;
};

export type WorkflowCondition = {
  field: string;
  operator: "equals" | "contains" | "changed" | "greater_than" | "less_than";
  value: string;
};

export type WorkflowAction = {
  type: "create_task" | "draft_message" | "update_crm" | "request_approval";
  label: string;
  target: string;
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  conditions: WorkflowCondition[];
  actions: WorkflowAction[];
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
};
