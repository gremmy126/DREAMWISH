export type TotpVerification =
  | { ok: true; counter: number }
  | { ok: false; reason: "invalid" | "replayed" | "clock_drift" };
