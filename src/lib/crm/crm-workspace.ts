import type { CrmActivity, Customer, CustomerImportance } from "./crm.types";

export type CrmPipelineSummary = {
  total: number;
  leads: number;
  active: number;
  paused: number;
  inactive: number;
  highIntent: number;
  nextBestActions: Array<{
    customerId: string;
    customerName: string;
    action: string;
    priority: CustomerImportance;
  }>;
};

export function getCrmPipelineSummary(customers: Customer[]): CrmPipelineSummary {
  const nextBestActions = customers.slice(0, 6).map((customer) => ({
    customerId: customer.id,
    customerName: customer.name,
    action: actionForCustomer(customer),
    priority: customer.importance
  }));

  return {
    total: customers.length,
    leads: customers.filter((customer) => customer.status === "lead").length,
    active: customers.filter((customer) => customer.status === "active").length,
    paused: customers.filter((customer) => customer.status === "paused").length,
    inactive: customers.filter((customer) => customer.status === "inactive").length,
    highIntent: customers.filter(
      (customer) => customer.importance === "high" || customer.importance === "critical"
    ).length,
    nextBestActions
  };
}

export function buildCrmActivityDrafts(
  customerId: string,
  memo: string
): Array<Omit<CrmActivity, "id" | "createdAt">> {
  const body = memo.trim() || "Follow up with the customer and record the outcome.";

  return [
    {
      customerId,
      type: "note",
      title: "Customer context note",
      body
    },
    {
      customerId,
      type: "task",
      title: "Next follow-up task",
      body: "Confirm next step, owner, expected date, and approval requirement."
    },
    {
      customerId,
      type: "email_draft",
      title: "Approval-first email draft",
      body: "Prepare a draft only. Do not send until the user approves the execution preview."
    }
  ];
}

function actionForCustomer(customer: Customer) {
  if (customer.status === "lead") return "Qualify lead and schedule the first follow-up.";
  if (customer.status === "active") return "Review recent activity and prepare the next offer.";
  if (customer.status === "paused") return "Check whether the blocker is still valid.";
  return "Reconfirm whether this customer should stay in CRM.";
}
