import { getBillingEntitlement } from "../billing/billing.repository";
import {
  requireOwnerContext,
  type OwnerContext
} from "./owner-context";

export class EntitlementRequiredError extends Error {
  readonly code = "PAYMENT_REQUIRED" as const;
  readonly status = 402 as const;

  constructor() {
    super("An active subscription is required.");
    this.name = "EntitlementRequiredError";
  }
}

export async function requireEntitledOwnerContext(
  request: Request
): Promise<OwnerContext> {
  const owner = await requireOwnerContext(request);
  if (owner.role === "admin") return owner;

  const entitlement = await getBillingEntitlement(owner.uid);
  if (entitlement.status !== "active") {
    throw new EntitlementRequiredError();
  }
  return owner;
}
