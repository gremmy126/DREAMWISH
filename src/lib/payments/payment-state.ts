export const PAYMENT_STATUS_KEY = "dreamwish-payment-complete-v1";

export type PaymentButtonState = {
  hidden: false;
  label: string;
  description: string;
  checkoutPath: string;
};

export function buildPaymentButtonState(_paymentComplete: boolean): PaymentButtonState {
  return {
    hidden: false,
    label: "Upgrade",
    description: "DREAMWISH Pro payment",
    checkoutPath: "/pricing"
  };
}
