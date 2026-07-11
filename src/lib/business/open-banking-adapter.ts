export interface OpenBankingAdapter {
  readonly enabled: boolean;
  connect(): Promise<never>;
  syncTransactions(): Promise<never>;
  revoke(): Promise<never>;
}

function unavailable(): Promise<never> {
  return Promise.reject(
    new Error("Open Banking is disabled until an approved provider contract is configured.")
  );
}

export const openBankingAdapter: OpenBankingAdapter = {
  enabled: false,
  connect: unavailable,
  syncTransactions: unavailable,
  revoke: unavailable
};
