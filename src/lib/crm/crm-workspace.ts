import type { CrmActivity, CrmInsight, Customer, CustomerImportance } from "./crm.types";

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
): Array<Omit<CrmActivity, "ownerId" | "id" | "createdAt">> {
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

export function buildCustomerInsight(customer: Customer, activities: CrmActivity[]): CrmInsight {
  const recent = activities.filter((item) => item.customerId === customer.id).slice(0, 5);
  const hasContact = Boolean(customer.email || customer.phone);
  const activityBoost = Math.min(25, recent.length * 5);
  const importanceBoost = customer.importance === "critical" ? 25 : customer.importance === "high" ? 15 : 5;
  const stageBoost = customer.status === "active" ? 25 : customer.status === "lead" ? 15 : 0;
  const contractProbability = Math.min(95, 20 + activityBoost + importanceBoost + stageBoost);
  const riskScore = Math.max(5, Math.min(95, 70 - activityBoost - (hasContact ? 20 : 0) + (customer.status === "paused" ? 20 : 0)));
  const nextAction = customer.nextContactAt
    ? `Follow up by ${customer.nextContactAt.slice(0, 10)} and record the outcome.`
    : customer.status === "lead"
      ? "Confirm the customer's need, budget, decision maker, and next meeting date."
      : actionForCustomer(customer);
  const evidence = [
    `${recent.length} recent CRM activities`,
    hasContact ? "A direct contact channel is available" : "No direct contact channel is recorded",
    `Customer status is ${customer.status}`,
    `Importance is ${customer.importance}`
  ];
  return {
    ownerId: customer.ownerId,
    customerId: customer.id,
    summary: `${customer.name} is a ${customer.status} customer at ${customer.companyName || "an unassigned company"}.`,
    nextAction,
    riskScore,
    contractProbability,
    evidence,
    generatedAt: new Date().toISOString()
  };
}

function actionForCustomer(customer: Customer) {
  if (customer.status === "lead") return "Qualify lead and schedule the first follow-up.";
  if (customer.status === "active") return "Review recent activity and prepare the next offer.";
  if (customer.status === "paused") return "Check whether the blocker is still valid.";
  return "Reconfirm whether this customer should stay in CRM.";
}
