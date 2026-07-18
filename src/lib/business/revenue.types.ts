export type RevenuePlatform = "android" | "ios" | "web";
export type RevenueCaptureMethod =
  | "notification_listener"
  | "share_extension"
  | "manual"
  | "gmail"
  | "csv"
  | "billing";
export type RevenueDirection = "income" | "expense" | "cancellation" | "unknown";
export type RevenueCandidateStatus = "provisional" | "confirmed" | "expense" | "personal" | "duplicate" | "rejected";
export type RevenueClassification = "unknown" | "revenue" | "expense" | "personal" | "duplicate" | "rejected";

export type RevenueCandidate = {
  id: string;
  ownerId: string;
  eventId: string;
  transactionFingerprint: string;
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
  classification: RevenueClassification;
  linkedCandidateId: string | null;
  confirmedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
