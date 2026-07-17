import type { AccountRole } from "../auth/access-control";
import { buildAccessState } from "../auth/access-control";
import { getActiveAccessGrant } from "../coupons/coupon.repository";
import type { AccessGrant } from "../coupons/coupon.types";

export function isAccessGrantActive(grant: AccessGrant | null, now = new Date()) {
  return Boolean(
    grant &&
      grant.status === "active" &&
      new Date(grant.startsAt).getTime() <= now.getTime() &&
      new Date(grant.endsAt).getTime() > now.getTime()
  );
}

export function resolveEffectiveEntitlement(input: {
  role: AccountRole;
  billingActive: boolean;
  grant: AccessGrant | null;
  now?: Date;
}) {
  return input.role === "admin" || input.billingActive || isAccessGrantActive(input.grant, input.now);
}

export async function hasEffectiveEntitlement(input: {
  userId: string;
  role: AccountRole;
  billingActive: boolean;
}) {
  if (input.role === "admin" || input.billingActive) return true;
  return isAccessGrantActive(await getActiveAccessGrant(input.userId));
}

export function buildOperationalAccessState(input: {
  email: string;
  role: AccountRole;
  entitled: boolean;
}) {
  const base = buildAccessState({ email: input.email, paid: input.entitled });
  if (input.role !== "admin") return base;
  return {
    ...base,
    role: "admin" as const,
    paid: true,
    adminBypass: true,
    canUseApp: true,
    requiresPayment: false
  };
}
