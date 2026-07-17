import type {
  ActionDefinition,
  ActionFieldDefinition,
  ActionScalar,
  ActionValue
} from "./action.types";

export type ActionValidationResult = {
  valid: boolean;
  value: Record<string, ActionValue>;
  errors: Record<string, string>;
};

export function validateActionInput(
  definition: ActionDefinition,
  input: Record<string, unknown>
): ActionValidationResult {
  const value: Record<string, ActionValue> = {};
  const errors: Record<string, string> = {};

  for (const field of definition.inputSchema.fields) {
    if (!isVisible(field, input)) continue;
    const normalized = normalizeField(field, input[field.id]);
    if (field.required && isEmpty(normalized)) {
      errors[field.id] = "필수 입력값입니다.";
      continue;
    }
    if (isEmpty(normalized)) {
      if (normalized !== undefined) value[field.id] = normalized as ActionValue;
      continue;
    }
    if (normalized === undefined) continue;
    const error = validateField(field, normalized);
    if (error) errors[field.id] = error;
    else value[field.id] = normalized as ActionValue;
  }

  for (const rule of definition.validation) {
    if (rule.kind === "required_any") {
      if (!rule.fields.some((field) => !isEmpty(value[field]))) errors[rule.fields[0]!] = rule.message;
    } else if (rule.kind === "different") {
      if (value[rule.left] === value[rule.right]) errors[rule.right] = rule.message;
    } else if (rule.kind === "less_than_or_equal") {
      if (Number(value[rule.left]) > Number(value[rule.right])) errors[rule.left] = rule.message;
    }
  }

  return { valid: Object.keys(errors).length === 0, value, errors };
}

function isVisible(field: ActionFieldDefinition, input: Record<string, unknown>) {
  if (!field.visibleWhen) return true;
  return input[field.visibleWhen.field] === field.visibleWhen.equals;
}

function normalizeField(field: ActionFieldDefinition, raw: unknown): ActionValue | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (field.type === "number" || field.type === "integer") {
      if (!trimmed) return undefined;
      const number = Number(trimmed);
      return Number.isFinite(number) ? number : trimmed;
    }
    if (field.type === "boolean") return trimmed === "true";
    if (field.type === "json" || field.type === "key_value") {
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed) as ActionValue;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  if (Array.isArray(raw)) return raw as ActionValue[];
  if (typeof raw === "object") return structuredClone(raw) as Record<string, ActionValue>;
  return String(raw);
}

function validateField(field: ActionFieldDefinition, value: ActionValue) {
  if (field.type === "email" && typeof value === "string") {
    const addresses = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (!addresses.length || addresses.some((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(item))) {
      return "올바른 이메일 주소를 입력하세요.";
    }
  }
  if (field.type === "url" && typeof value === "string") {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return "올바른 URL을 입력하세요.";
    } catch {
      return "올바른 URL을 입력하세요.";
    }
  }
  if ((field.type === "number" || field.type === "integer") && typeof value !== "number") {
    return "숫자를 입력하세요.";
  }
  if (field.type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
    return "정수를 입력하세요.";
  }
  if (typeof value === "number" && field.min !== undefined && value < field.min) {
    return `${field.min} 이상이어야 합니다.`;
  }
  if (typeof value === "number" && field.max !== undefined && value > field.max) {
    return `${field.max} 이하여야 합니다.`;
  }
  if ((field.type === "json" || field.type === "key_value") && typeof value === "string") {
    return "올바른 JSON을 입력하세요.";
  }
  if (field.type === "select" && field.options && typeof value === "string") {
    if (!field.options.some((option) => option.value === value)) return "허용된 값을 선택하세요.";
  }
  return null;
}

function isEmpty(value: ActionValue | undefined) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

export function toActionScalar(value: unknown): ActionScalar {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null
    ? value
    : String(value ?? "");
}
