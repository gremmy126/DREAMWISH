export const POLAR_CHECKOUT_SETTINGS = {
  provider: "polar",
  planName: "DREAMWISH Pro",
  amountUsd: 19,
  amountCents: 1900,
  currency: "USD",
  successUrl: "https://dreamwish.co.kr/payment/success",
  returnUrl: "https://dreamwish.co.kr/pricing?payment=cancelled",
  webhookUrl: "https://dreamwish.co.kr/api/webhooks/polar"
} as const;

export function buildPolarCheckoutBrand() {
  return {
    name: "DREAMWISH"
  } as const;
}
