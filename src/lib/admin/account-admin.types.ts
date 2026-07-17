import type { AccountRole } from "../auth/access-control";

export type AccountStatus = "active" | "suspended" | "deletion_pending" | "deleted";
export type IdentityProvider = "password" | "kakao" | "naver";

export type OperationalAccount = {
  id: string;
  email: string;
  name: string | null;
  role: AccountRole;
  status: AccountStatus;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  deletionScheduledAt: string | null;
};

export type AdminAction =
  | "suspend"
  | "restore"
  | "force_logout"
  | "promote"
  | "demote"
  | "schedule_delete"
  | "cancel_delete"
  | "delete";

export type AdminUserMutation = {
  type: AdminAction;
  deletionScheduledAt?: string | null;
};

export type AuthIdentity = {
  accountId: string;
  provider: IdentityProvider;
  providerSubject: string;
  createdAt: string;
  lastLoginAt: string;
};

