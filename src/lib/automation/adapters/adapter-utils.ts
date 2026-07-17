import type { ActionValue } from "../registry/action.types";

export function text(input: Record<string, ActionValue>, key: string, fallback = "") {
  const value = input[key];
  return value === null || value === undefined ? fallback : String(value);
}

export function numberValue(input: Record<string, ActionValue>, key: string, fallback = 0) {
  const value = Number(input[key]);
  return Number.isFinite(value) ? value : fallback;
}

export function booleanValue(input: Record<string, ActionValue>, key: string, fallback = false) {
  return typeof input[key] === "boolean" ? input[key] : fallback;
}

export function objectValue(input: Record<string, ActionValue>, key: string) {
  const value = input[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, ActionValue>
    : {};
}

export function arrayValue(input: Record<string, ActionValue>, key: string) {
  const value = input[key];
  return Array.isArray(value) ? value : [];
}

export function compactObject(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

export function encodePath(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}
