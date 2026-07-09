export type PaymentMarket = "domestic" | "international";
export type PaymentProviderId = "kg_inicis" | "polar";

export type PaymentProviderConfig = {
  id: PaymentProviderId;
  market: PaymentMarket;
  label: string;
  description: string;
  status: "configured" | "mock";
};

export const paymentProviders: PaymentProviderConfig[] = [
  {
    id: "kg_inicis",
    market: "domestic",
    label: "KG이니시스",
    description: "국내 결제 승인과 결제 내역 연결을 담당합니다.",
    status: "mock"
  },
  {
    id: "polar",
    market: "international",
    label: "Polar",
    description: "해외 결제와 $19 단일 상품 Checkout을 담당합니다.",
    status: "configured"
  }
];

export function listPaymentProviders() {
  return paymentProviders;
}
