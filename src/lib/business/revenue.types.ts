export type RevenuePlatform = "android" | "ios" | "web";
export type RevenueCaptureMethod =
  | "notification_listener"
  | "share_extension"
  | "manual"
  | "gmail"
  | "csv";
export type RevenueDirection = "income" | "expense" | "cancellation" | "unknown";
export type RevenueCandidateStatus = "provisional" | "confirmed" | "rejected";

export type RevenueCandidate = {
  id: string;
  ownerId: string;
  eventId: string;
  platform: RevenuePlatform;
  captureMethod: RevenueCaptureMethod;
  sourceApp: string;
  capturedAt: string;
  encryptedRawText: string;
  amount: number | null;
  confirmedAmount: number | null;
  currency: "KRW";
  direction: RevenueDirection;
  counterpartyHint: string | null;
  confidence: number;
  evidence: string[];
  status: RevenueCandidateStatus;
  confirmedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
