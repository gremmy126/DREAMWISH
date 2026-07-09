export const PAYMENT_STATUS_KEY = "dreamwish-payment-complete-v1";

export type PaymentButtonState = {
  hidden: boolean;
  label: string;
  description: string;
  checkoutPath: string;
};

export function buildPaymentButtonState(paymentComplete: boolean): PaymentButtonState {
  return {
    hidden: paymentComplete,
    label: "Upgrade",
    description: "DREAMWISH Pro payment",
    checkoutPath: "/pricing"
  };
}
