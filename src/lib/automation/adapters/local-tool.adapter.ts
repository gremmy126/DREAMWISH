import type { ActionAdapter, ActionAdapterExecutionInput } from "./action-adapter.types";
import { arrayValue, numberValue, objectValue, text } from "./adapter-utils";
import { isAdapterImplementationAvailable } from "./adapter-availability";

export const localToolAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return isAdapterImplementationAvailable(adapterKey, adapterVersion) && LOCAL_APPS.has(adapterKey.split(".")[0]!);
  },
  async execute(input) {
    const startedAt = performance.now();
    return { output: executeLocal(input), adapterLatencyMs: Math.round(performance.now() - startedAt) };
  }
};

const LOCAL_APPS = new Set(["text-formatter", "datetime", "math", "json", "csv", "array-aggregator", "text-aggregator", "router", "delay", "iterator"]);

function executeLocal({ definition, normalizedInput: input }: ActionAdapterExecutionInput): Record<string, unknown> {
  const id = definition.id;
  if (definition.appId === "text-formatter") {
    const value = text(input, "text");
    if (id === "uppercase") return { result: value.toUpperCase() };
    if (id === "lowercase") return { result: value.toLowerCase() };
    if (id === "trim") return { result: value.trim() };
    if (id === "replace") return { result: value.split(text(input, "search")).join(text(input, "replacement")) };
    if (id === "split") return { result: value.split(text(input, "separator")) };
    if (id === "join") return { result: arrayValue(input, "items").map(String).join(text(input, "separator")) };
    if (id === "substring") return { result: value.slice(numberValue(input, "start"), input.length === undefined ? undefined : numberValue(input, "length")) };
  }
  if (definition.appId === "math") {
    const values = arrayValue(input, "values").map(Number).filter(Number.isFinite);
    if (values.length === 0) throw new Error("At least one finite number is required.");
    if (id === "add") return { result: values.reduce((sum, value) => sum + value, 0) };
    if (id === "subtract") return { result: values.slice(1).reduce((result, value) => result - value, values[0]!) };
    if (id === "multiply") return { result: values.reduce((result, value) => result * value, 1) };
    if (id === "divide") return { result: values.slice(1).reduce((result, value) => { if (value === 0) throw new Error("Division by zero is not allowed."); return result / value; }, values[0]!) };
    if (id === "average") return { result: values.reduce((sum, value) => sum + value, 0) / values.length };
    if (id === "maximum") return { result: Math.max(...values) };
    if (id === "minimum") return { result: Math.min(...values) };
  }
  if (definition.appId === "json") {
    if (id === "parse") return { result: JSON.parse(text(input, "text")) as unknown };
    if (id === "stringify") return { result: JSON.stringify(input.value, null, input.pretty === true ? 2 : 0) };
    if (id === "merge") return { result: Object.assign({}, ...arrayValue(input, "objects").filter((item) => item && typeof item === "object" && !Array.isArray(item))) };
    if (id === "validate") return { result: { valid: typeof input.value === typeof objectValue(input, "schema").type || !objectValue(input, "schema").type } };
  }
  if (definition.appId === "datetime") return executeDateTime(id, input);
  if (definition.appId === "csv") return executeCsv(id, input);
  if (definition.appId === "array-aggregator" || definition.appId === "text-aggregator") return executeAggregator(definition.appId, id, input);
  if (definition.appId === "iterator") {
    const items = id === "number" ? Array.from({ length: numberValue(input, "count") }, (_, index) => index + 1) : arrayValue(input, "array");
    return { result: { items: items.slice(0, numberValue(input, "limit", items.length)), concurrency: numberValue(input, "concurrency", 1) } };
  }
  if (definition.appId === "delay") {
    const resumeAt = id === "until-date" ? new Date(text(input, "until")) : new Date(Date.now() + delayMs(id, input));
    return { result: { directive: "delay", resumeAt: resumeAt.toISOString() } };
  }
  if (definition.appId === "router") return { result: { directive: "route", mode: id, input } };
  throw new Error(`Local adapter does not implement ${definition.adapterKey}.`);
}

function executeDateTime(id: string, input: ActionAdapterExecutionInput["normalizedInput"]) {
  if (id === "now") return { result: new Date().toISOString() };
  if (id === "format") return { result: new Date(text(input, "value")).toISOString() };
  if (id === "difference") {
    const milliseconds = new Date(text(input, "end")).getTime() - new Date(text(input, "start")).getTime();
    return { result: milliseconds / unitMs(text(input, "unit", "milliseconds")) };
  }
  const date = new Date(text(input, "value"));
  date.setTime(date.getTime() + numberValue(input, "amount") * unitMs(text(input, "unit")));
  return { result: date.toISOString() };
}

function executeCsv(id: string, input: ActionAdapterExecutionInput["normalizedInput"]) {
  const delimiter = text(input, "delimiter", ",");
  if (id === "read") return { result: text(input, "csv").split(/\r?\n/u).filter(Boolean).map((line) => line.split(delimiter)) };
  const rows = arrayValue(input, "rows");
  return { result: rows.map((row) => Array.isArray(row) ? row.map(csvCell).join(delimiter) : Object.values(row as Record<string, unknown>).map(csvCell).join(delimiter)).join("\n") };
}

function executeAggregator(appId: string, id: string, input: ActionAdapterExecutionInput["normalizedInput"]) {
  const items = arrayValue(input, "items");
  if (appId === "text-aggregator") return { result: items.map(String).join(id === "join-lines" ? "\n" : text(input, "separator", id === "markdown" ? "\n\n" : "")) };
  if (id === "merge") return { result: items.flatMap((item) => Array.isArray(item) ? item : [item]) };
  if (id === "group") return { result: Object.groupBy(items, (item) => String(item)) };
  const values = items.map(Number).filter(Number.isFinite);
  const sum = values.reduce((total, value) => total + value, 0);
  return { result: id === "average" ? sum / Math.max(1, values.length) : sum };
}

function unitMs(unit: string) { return ({ milliseconds: 1, seconds: 1_000, minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000, months: 2_629_800_000 } as Record<string, number>)[unit] || 1; }
function delayMs(id: string, input: ActionAdapterExecutionInput["normalizedInput"]) { return numberValue(input, id) * unitMs(id); }
function csvCell(value: unknown) { const result = String(value ?? ""); return /[",\n]/u.test(result) ? `"${result.replace(/"/gu, '""')}"` : result; }
