import type { OwnerContext } from "../auth/owner-context";
import { requireOwnerContext } from "../auth/owner-context";
import type { AdminAction, OperationalAccount } from "./account-admin.types";

export class AdminAccessError extends Error {
  readonly status = 403 as const;
  readonly code = "ADMIN_REQUIRED" as const;

  constructor(message = "Administrator access is required.") {
    super(message);
    this.name = "AdminAccessError";
  }
}

export async function requireAdminContext(request: Request): Promise<OwnerContext> {
  const owner = await requireOwnerContext(request);
  if (owner.role !== "admin") throw new AdminAccessError();
  return owner;
}

export function assertAdminMutationAllowed(
  actor: OperationalAccount,
  target: OperationalAccount,
  action: AdminAction,
  activeAdministratorCount: number
) {
  if (actor.role !== "admin" || actor.status !== "active") {
    throw new AdminAccessError();
  }
  const selfDestructive = ["suspend", "demote", "schedule_delete", "delete"].includes(action);
  const removesActiveAdmin =
    target.role === "admin" && target.status === "active" && selfDestructive;
  if (removesActiveAdmin && activeAdministratorCount <= 1) {
    throw new AdminAccessError("The last active administrator cannot be removed.");
  }
  if (actor.id === target.id && selfDestructive) {
    throw new AdminAccessError("You cannot modify your own administrator account this way.");
  }
}
