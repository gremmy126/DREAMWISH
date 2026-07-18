import type { DomesticBillingConfig } from "./billing-config";
import type { BillingGateway, BillingProvider } from "./billing-gateway.types";

const gateways = new Map<BillingProvider, BillingGateway>();

export function registerBillingGateway(gateway: BillingGateway) {
  gateways.set(gateway.provider, gateway);
}

export function getBillingGateway(
  config: DomesticBillingConfig,
  use: "new_subscription" | "existing_subscription",
  existingProvider?: BillingProvider
): BillingGateway {
  const provider =
    use === "existing_subscription" && existingProvider
      ? existingProvider
      : config.primaryProvider;
  return gateways.get(provider) || unavailableGateway(provider);
}

function unavailableGateway(provider: BillingProvider): BillingGateway {
  const fail = async () => {
    throw new Error(`Billing adapter is not configured: ${provider}`);
  };
  return {
    provider,
    createCheckout: fail,
    issueBillingMethod: fail,
    charge: fail,
    refundPayment: fail,
    cancelSubscription: fail,
    verifyPayment: fail
  } as BillingGateway;
}
