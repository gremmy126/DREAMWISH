import type { ActionValue } from "../registry/action.types";

const SENSITIVE_KEY = /authorization|password|secret|token|api[-_]?key|credential|cookie|client[-_]?secret/i;
const BEARER_VALUE = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;

export function maskAutomationSecrets(value: unknown, key = ""): ActionValue {
  if (SENSITIVE_KEY.test(key) && value !== null && value !== undefined && value !== "") return "***";
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value.replace(BEARER_VALUE, "Bearer ***");
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => maskAutomationSecrets(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, childValue]) => [
        childKey,
        maskAutomationSecrets(childValue, childKey)
      ])
    );
  }
  return String(value);
}
