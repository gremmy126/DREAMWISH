import { paymentProviders, type PaymentMarket } from "./payment.types";

export function getPaymentProviderForMarket(market: PaymentMarket) {
  return paymentProviders.find((provider) => provider.market === market);
}
