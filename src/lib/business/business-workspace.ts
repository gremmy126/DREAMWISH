type BusinessCustomer = {
  companyName?: string;
  expectedValue?: number;
  nextContactAt?: string | null;
};

type BusinessActivity = {
  id?: string;
  customerId?: string;
  type?: string;
  createdAt?: string;
};

type BusinessTask = {
  id?: string;
  completedAt?: string | null;
};

type BusinessDeal = {
  id?: string;
  stage?: string;
  value?: number;
  probability?: number;
};

type BusinessRevenueCandidate = {
  status?: string;
  direction?: string;
  confirmedAmount?: number | null;
};

export function buildBusinessSummary(input: {
  customers: BusinessCustomer[];
  activities: BusinessActivity[];
  tasks: BusinessTask[];
  deals: BusinessDeal[];
  revenueCandidates?: BusinessRevenueCandidate[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const today = now.toISOString().slice(0, 10);
  const openDeals = input.deals.filter(
    (deal) => deal.stage !== "won" && deal.stage !== "lost"
  );

  return {
    customerCount: input.customers.length,
    companyCount: new Set(
      input.customers.map((customer) => customer.companyName?.trim()).filter(Boolean)
    ).size,
    activeDealCount: openDeals.length,
    expectedRevenue: sum(input.customers.map((customer) => customer.expectedValue)),
    confirmedRevenue:
      sum(input.deals.filter((deal) => deal.stage === "won").map((deal) => deal.value)) +
      sum(
        (input.revenueCandidates || [])
          .filter(
            (candidate) =>
              candidate.status === "confirmed" && candidate.direction === "income"
          )
          .map((candidate) => candidate.confirmedAmount || 0)
      ),
    weightedPipeline: openDeals.reduce(
      (total, deal) => total + numberValue(deal.value) * (numberValue(deal.probability) / 100),
      0
    ),
    openTaskCount: input.tasks.filter((task) => !task.completedAt).length,
    todayMeetingCount: input.activities.filter(
      (activity) => activity.type === "meeting" && activity.createdAt?.slice(0, 10) === today
    ).length,
    followUpCustomerCount: input.customers.filter((customer) => {
      if (!customer.nextContactAt) return false;
      const timestamp = new Date(customer.nextContactAt).getTime();
      return Number.isFinite(timestamp) && timestamp <= now.getTime();
    }).length
  };
}

function sum(values: Array<number | undefined>) {
  return values.reduce<number>((total, value) => total + numberValue(value), 0);
}

function numberValue(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}
