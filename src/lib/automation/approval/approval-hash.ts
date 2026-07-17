import { createHash, timingSafeEqual } from "node:crypto";
import type { ActionValue } from "../registry/action.types";
import type { ApprovalSnapshot, BuildApprovalSnapshotInput } from "./approval.types";

const SNAPSHOT_DOMAIN = "dreamwish-automation-approval-snapshot-v1";
const INPUT_DOMAIN = "dreamwish-automation-approval-input-v1";
const SECRET_KEY = /authorization|password|secret|token|api[-_]?key|credential|cookie/i;

export class ApprovalSnapshotMismatchError extends Error {
  readonly code = "APPROVAL_SNAPSHOT_MISMATCH";
  constructor() {
    super("승인된 내용과 실제 실행 내용이 변경되었습니다. 다시 승인해 주세요.");
    this.name = "ApprovalSnapshotMismatchError";
  }
}

export function buildApprovalSnapshot(input: BuildApprovalSnapshotInput) {
  const normalizedInput = stripSecretValues(input.normalizedInput) as Record<string, ActionValue>;
  const inputHash = hashDomain(INPUT_DOMAIN, normalizedInput);
  const snapshot: ApprovalSnapshot = {
    workflowId: requireText(input.workflowId, "workflowId"),
    workflowVersion: requirePositiveInt(input.workflowVersion, "workflowVersion"),
    executionId: requireText(input.executionId, "executionId"),
    nodeId: requireText(input.nodeId, "nodeId"),
    appId: input.appId ? requireText(input.appId, "appId") : "legacy",
    actionId: requireText(input.actionId, "actionId"),
    actionVersion: requirePositiveInt(input.actionVersion, "actionVersion"),
    adapterVersion: requirePositiveInt(input.adapterVersion, "adapterVersion"),
    integrationConnectionId: input.integrationConnectionId ? requireText(input.integrationConnectionId, "integrationConnectionId") : null,
    inputHash,
    normalizedInput,
    targetAccount: input.targetAccount ? String(input.targetAccount) : null,
    targetResources: [...input.targetResources].map(String).sort(),
    executionCount: requirePositiveInt(input.executionCount, "executionCount"),
    amount: input.amount === null ? null : requireFinite(input.amount, "amount"),
    currency: input.currency ? String(input.currency).toUpperCase() : null,
    scheduledFor: input.scheduledFor ? normalizeInstant(input.scheduledFor, "scheduledFor") : null,
    outputSchemaVersion: requirePositiveInt(input.outputSchemaVersion, "outputSchemaVersion"),
    riskLevel: input.riskLevel,
    approvalPolicy: input.approvalPolicy,
    approvalExpiresAt: normalizeInstant(input.approvalExpiresAt, "approvalExpiresAt")
  };
  return { snapshot, inputHash, snapshotHash: computeApprovalHash(snapshot) };
}

export function computeApprovalHash(snapshot: ApprovalSnapshot) {
  return hashDomain(SNAPSHOT_DOMAIN, snapshot);
}

export function verifyApprovalSnapshot(approvedHash: string, actualSnapshot: ApprovalSnapshot) {
  const actualHash = computeApprovalHash(actualSnapshot);
  const approved = Buffer.from(approvedHash, "hex");
  const actual = Buffer.from(actualHash, "hex");
  if (approved.length !== actual.length || !timingSafeEqual(approved, actual)) throw new ApprovalSnapshotMismatchError();
  return actualHash;
}

export function stripSecretValues(value: unknown, key = ""): ActionValue {
  if (SECRET_KEY.test(key)) return null;
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return requireFinite(value, key || "value");
  if (Array.isArray(value)) return value.map((item) => stripSecretValues(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([childKey]) => !SECRET_KEY.test(childKey))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([childKey, childValue]) => [childKey, stripSecretValues(childValue, childKey)])
    );
  }
  return String(value);
}

function hashDomain(domain: string, value: unknown) {
  return createHash("sha256").update(domain).update("\0").update(canonicalJson(value)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(requireFinite(value, "value"));
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function requireText(value: string, name: string) {
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 500) throw new Error(`${name} is required.`);
  return normalized;
}

function requirePositiveInt(value: number, name: string) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function requireFinite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}

function normalizeInstant(value: string, name: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO timestamp.`);
  return parsed.toISOString();
}
