import {
  normalizeExternalEvent,
  normalizeExternalMessage
} from "@/src/lib/sync/normalizer";

export { normalizeExternalEvent, normalizeExternalMessage };

export function maskSensitiveText(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[masked-email]")
    .replace(/\b\d{2,4}-\d{3,4}-\d{4}\b/gu, "[masked-phone]");
}
