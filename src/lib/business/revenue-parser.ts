import type {
  RevenueCaptureMethod,
  RevenueDirection,
  RevenuePlatform
} from "./revenue.types";

export function parseRevenueSignal(text: string) {
  const normalized = text.replace(/\s+/gu, " ").trim();
  const amountMatch = normalized.match(/(\d[\d,]*)\s*원/u);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/gu, "")) : null;
  const direction = detectDirection(normalized);
  const directionEvidence =
    direction === "income"
      ? "입금"
      : direction === "cancellation"
        ? "승인취소"
        : direction === "expense"
          ? normalized.includes("출금")
            ? "출금"
            : "승인"
          : null;
  const counterpartyMatch = normalized.match(/원\s+([^\s]+)(?:\s+잔액|$)/u);
  const confidence = amount && direction !== "unknown"
    ? direction === "income"
      ? 0.92
      : 0.88
    : amount
      ? 0.45
      : 0.1;

  return {
    amount: amount && Number.isFinite(amount) ? amount : null,
    currency: "KRW" as const,
    direction,
    counterpartyHint: counterpartyMatch?.[1] || null,
    confidence,
    evidence: [directionEvidence, amountMatch?.[0]].filter(Boolean) as string[]
  };
}

export function redactRevenueText(text: string) {
  return text.replace(/\b\d{2,6}-\d{2,6}-(\d{4,6})\b/gu, "***-***-$1");
}

export function validateRevenueCapture(input: {
  platform: RevenuePlatform;
  captureMethod: RevenueCaptureMethod;
}) {
  if (input.platform === "ios" && input.captureMethod === "notification_listener") {
    throw new Error("iPhone does not allow automatic reading of other apps notifications.");
  }
  if (input.captureMethod === "notification_listener" && input.platform !== "android") {
    throw new Error("Notification listener capture is available only on Android.");
  }
}

function detectDirection(text: string): RevenueDirection {
  if (/(승인\s*취소|승인취소|결제\s*취소|취소)/u.test(text)) return "cancellation";
  if (/(입금|받았습니다|수신)/u.test(text)) return "income";
  if (/(출금|카드\s*승인|카드승인|결제|승인)/u.test(text)) return "expense";
  return "unknown";
}
