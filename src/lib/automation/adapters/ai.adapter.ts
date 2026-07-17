import { chatWithAI } from "../../ai/ai.service";
import type { AIMessage } from "../../ai/ai-provider";
import { OpenAICompatibleProvider } from "../../ai/openai-compatible.provider";
import { resolveStructuredActionCredential } from "../action-credential.service";
import type { ActionAdapter, ActionAdapterExecutionInput } from "./action-adapter.types";
import { isAdapterImplementationAvailable } from "./adapter-availability";
import { text } from "./adapter-utils";

const AI_APPS = new Set(["ai", "openai"]);

export const aiActionAdapter: ActionAdapter = {
  adapterVersion: 1,
  supports(adapterKey, adapterVersion) {
    return AI_APPS.has(adapterKey.split(".")[0]!) && isAdapterImplementationAvailable(adapterKey, adapterVersion);
  },
  async execute(input) {
    const startedAt = Date.now();
    const answer = input.definition.appId === "openai"
      ? await executeWithUserOpenAiCredential(input)
      : await chatWithAI(buildAiMessages(input));
    return {
      output: buildAiOutput(answer, text(input.normalizedInput, "outputFormat", "text")),
      adapterLatencyMs: Date.now() - startedAt
    };
  }
};

async function executeWithUserOpenAiCredential(input: ActionAdapterExecutionInput) {
  if (!input.connectionId) {
    throw Object.assign(new Error("A verified OpenAI API credential must be selected."), {
      code: "CONNECTION_REQUIRED",
      retryable: false
    });
  }
  const credential = await resolveStructuredActionCredential(input.ownerId, input.connectionId, "openai");
  const provider = new OpenAICompatibleProvider({
    name: "OpenAI",
    model: text(input.normalizedInput, "model", process.env.OPENAI_AUTOMATION_MODEL || "gpt-4o-mini"),
    apiKey: credential.values.apiKey,
    baseUrl: "https://api.openai.com/v1",
    missingKeyMessage: "The selected OpenAI credential has no API key."
  });
  return provider.chat(buildAiMessages(input));
}

export function buildAiMessages(input: ActionAdapterExecutionInput): AIMessage[] {
  const values = input.normalizedInput;
  const source = stringifyInput(values.input);
  const customPrompt = text(values, "prompt").trim();
  const systemPrompt = text(values, "systemPrompt").trim() || systemInstruction(input.definition.id);
  const formatInstruction = text(values, "outputFormat", "text") === "json"
    ? "Return valid JSON only. Do not wrap it in Markdown code fences."
    : "Return only the requested result without meta commentary.";
  return [
    { role: "system", content: `${systemPrompt}\n${formatInstruction}` },
    {
      role: "user",
      content: customPrompt ? `${customPrompt}\n\nInput:\n${source}` : source
    }
  ];
}

export function buildAiOutput(answer: string, outputFormat: string) {
  const textOutput = answer.trim();
  if (outputFormat !== "json") return { text: textOutput, data: null };
  const candidate = textOutput.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  try {
    const parsed = JSON.parse(candidate) as unknown;
    return {
      text: textOutput,
      data: parsed && typeof parsed === "object" ? parsed : { value: parsed }
    };
  } catch {
    throw Object.assign(new Error("AI 응답이 요청한 JSON 형식이 아닙니다."), {
      code: "AI_OUTPUT_INVALID_JSON",
      retryable: true
    });
  }
}

function stringifyInput(value: unknown) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value, null, 2);
}

function systemInstruction(actionId: string) {
  const instructions: Record<string, string> = {
    chat: "Answer the supplied request accurately and concisely.",
    summarize: "Summarize the input while preserving important facts, names, dates, amounts, and requested actions.",
    translate: "Translate the input according to the user's prompt while preserving meaning and formatting.",
    "generate-json": "Convert the input into the requested structured JSON without inventing facts.",
    "analyze-email": "Analyze the email and identify its purpose, urgency, important facts, requested actions, and a concise summary.",
    "analyze-document": "Analyze the document and extract its main points, decisions, risks, and action items.",
    "extract-keywords": "Extract the most meaningful keywords and short key phrases from the input.",
    "analyze-sentiment": "Analyze sentiment, tone, confidence, and notable emotional signals in the input.",
    "draft-reply": "Draft a clear, professional reply grounded only in the supplied input."
  };
  return instructions[actionId] || "Analyze the input according to the user's instructions without inventing facts.";
}
